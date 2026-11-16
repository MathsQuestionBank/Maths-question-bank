#!/usr/bin/env python3
"""Offline label audit: no network, question classification or database writes.

Input is a read-only metadata export kept outside Git. Runtime canonical rules
are read from the same JSON registry used by Insights. Similarity only creates
an unapplied human review queue, never a merge rule.
"""
import argparse
import collections
import csv
import difflib
import hashlib
import json
import re
import unicodedata
from pathlib import Path


def normal(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', s).strip()).lower()


def generate(records, rules, out, *, evidence=None, snapshot_date='2026-11-16', base_commit='2996986'):
    out.mkdir(parents=True, exist_ok=True)
    aliases = {}
    for group in rules['groups']:
        for alias in group['aliases']:
            key = normal(alias)
            if key in aliases and aliases[key]['id'] != group['id']:
                raise ValueError('Conflicting explicit alias')
            aliases[key] = group
    reviews = {normal(r['label']): r['reason'] for r in rules['requiresReview']}

    def resolve(label):
        group = aliases.get(normal(label))
        reason = reviews.get(normal(label)) or ('Truncated wording: no automatic prefix expansion.' if re.search(r'\.\.\.|…', label) else '')
        return ('canonical:' + group['id'] if group else 'stored:' + normal(label),
                group['label'] if group else re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', label).strip()), reason,
                group['rationale'] if group else 'Retain source wording; no semantic equivalence inferred.')

    def family(r):
        ref = re.fullmatch(r'Q?0*(\d+)([a-z]*)', r['question_number'], re.I)
        if not ref:
            raise ValueError('Unparseable question reference')
        return r['paper_id'] + ':Q' + str(int(ref[1]))

    def new_entry():
        return {'records': set(), 'questions': set(), 'topics': set(), 'tiers': set()}

    def add(entry, record):
        entry['records'].add(record['id'])
        entry['questions'].add(family(record))
        entry['topics'].add(record['topic'])
        entry['tiers'].add(record['tier'])

    atomic, fields, canonical = {}, {}, {}
    old_rows, whole, ambiguous = set(), set(), []
    for r in records:
        whole.add(family(r))
        field = fields.setdefault(r['skill'], new_entry())
        add(field, r)
        field.setdefault('canonical_labels', set())
        for raw in set(r['skill'].split(';')):
            if not normal(raw) or normal(raw) in {'unknown', 'unmapped', 'unspecified', 'n/a'}:
                continue
            cid, label, reason, rationale = resolve(raw)
            entry = atomic.setdefault(raw, new_entry())
            add(entry, r)
            entry.update(canonical_id=cid, canonical_label=label, review_reason=reason, rationale=rationale)
            field['canonical_labels'].add(label)
            old_rows.add((normal(r['topic']), normal(raw), r['tier']))
            row_key = json.dumps([cid, normal(r['topic']), r['tier']], ensure_ascii=False, separators=(',', ':')) if reason else cid
            merged = canonical.setdefault(row_key, {**new_entry(), 'canonical_id': cid, 'canonical_label': label, 'review_reason': reason, 'original_labels': set()})
            add(merged, r)
            merged['original_labels'].add(raw)
            if reason:
                ambiguous.append({**{k: r[k] for k in ['id', 'source_id', 'paper_id', 'series', 'paper_code', 'tier', 'question_number', 'skill', 'topic', 'original_skill', 'specification']}, 'raw_label': raw, 'retained_label': label, 'reason': reason})

    def counts(e):
        return {'mapped_records': len(e['records']), 'whole_questions': len(e['questions']), 'topics': sorted(e['topics']), 'tiers': sorted(e['tiers'])}

    def write_csv(name, headers, rows):
        # Quote all fields and neutralise spreadsheet formulas without changing the JSON evidence.
        with (out / name).open('w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator='\n')
            writer.writerow(headers)
            for row in rows:
                writer.writerow(["'" + str(v) if re.match(r'^[\s]*[=+\-@]', str(v)) else v for v in row])

    label_rows = [{'original_label': raw, **counts(e), **{k: e[k] for k in ['canonical_id', 'canonical_label', 'review_reason', 'rationale']}} for raw, e in sorted(atomic.items())]
    (out / 'atomic-labels.json').write_text(json.dumps(label_rows, indent=2, ensure_ascii=False) + '\n')
    write_csv('atomic-labels.csv', ['Original label (JSON quoted)', 'Mapped records', 'Whole questions', 'Canonical / retained label', 'Resolution', 'Reason', 'Original topics', 'Original tiers'],
              [[json.dumps(raw, ensure_ascii=False), len(e['records']), len(e['questions']), e['canonical_label'], 'Needs review — unmerged' if e['review_reason'] else 'Explicit alias' if e['canonical_id'].startswith('canonical:') else 'Retained', e['review_reason'] or e['rationale'], ' | '.join(sorted(e['topics'])), ' | '.join(sorted(e['tiers']))] for raw, e in sorted(atomic.items())])
    write_csv('stored-fields.csv', ['Original complete skill field (JSON quoted)', 'Mapped records', 'Whole questions', 'Canonical / retained labels (JSON)', 'Original topics', 'Original tiers'],
              [[json.dumps(raw, ensure_ascii=False), len(e['records']), len(e['questions']), json.dumps(sorted(e['canonical_labels']), ensure_ascii=False), ' | '.join(sorted(e['topics'])), ' | '.join(sorted(e['tiers']))] for raw, e in sorted(fields.items())])
    (out / 'canonical-coverage.json').write_text(json.dumps([{'row_key': key, **{k: e[k] for k in ['canonical_id', 'canonical_label', 'review_reason']}, **counts(e), 'original_labels': sorted(e['original_labels'])} for key, e in sorted(canonical.items())], indent=2, ensure_ascii=False) + '\n')
    write_csv('ambiguous-records.csv', ['Record ID', 'Source ID', 'Paper ID', 'Series', 'Paper', 'Tier', 'Printed reference', 'Complete skill field', 'Topic', 'Retained original_skill (not verified)', 'Specification (not a classifier)', 'Unresolved token (JSON)', 'Retained label', 'Reason'],
              [[r[k] if r[k] is not None else '' for k in ['id', 'source_id', 'paper_id', 'series', 'paper_code', 'tier', 'question_number', 'skill', 'topic', 'original_skill', 'specification']] + [json.dumps(r['raw_label'], ensure_ascii=False), r['retained_label'], r['reason']] for r in ambiguous])

    # Exhaustive lexical candidate scan, NOT a semantic mapping or confidence score.
    names = sorted({normal(raw): raw.strip() for raw in atomic}.values())
    candidates = []
    for i, left in enumerate(names):
        for right in names[i + 1:]:
            if resolve(left)[0] != resolve(right)[0] and difflib.SequenceMatcher(None, normal(left), normal(right)).ratio() >= .84:
                candidates.append([left, right, 'Unmerged: lexical similarity alone is not mathematical evidence. Check scope, operation, dimension, equation type and actual content.'])
    write_csv('unmerged-lexical-candidates.csv', ['Label A', 'Label B', 'Decision'], candidates)
    cases = (evidence or {}).get('cases', [])
    by_id = {r['id']: r for r in records}
    for case in cases:
        row = by_id.get(case['database_record_id'])
        if not row or row['paper_id'] != case['paper_id'] or row['question_number'] != case['stored_question_reference']:
            raise ValueError('Source case does not match the metadata snapshot')
    summary = {'snapshot_date_utc': snapshot_date, 'base_commit': base_commit, 'scope': 'Stored Edexcel GCSE Mathematics Foundation/Higher examination metadata; excludes linked shadows and original practice.',
               'mapped_records': len(records), 'papers': len({r['paper_id'] for r in records}), 'whole_question_groups': len(whole), 'complete_raw_skill_fields': len(fields), 'raw_semicolon_tokens_including_spacing_variants': len(atomic), 'normalised_token_labels_before': len({normal(raw) for raw in atomic}),
               'canonical_or_retained_labels_after': len({e['canonical_id'] for e in atomic.values()}), 'topic_skill_tier_rows_before': len(old_rows), 'coverage_rows_after': len(canonical), 'controlled_wording_groups': len(rules['groups']),
               'unresolved_distinct_labels': len({normal(r['raw_label']) for r in ambiguous}), 'unresolved_record_token_associations': len(ambiguous), 'unresolved_records': len({r['id'] for r in ambiguous}), 'generic_solving_equations_records': len({r['id'] for r in ambiguous if normal(r['raw_label']) == 'solving equations'}),
               'unmerged_lexical_candidate_pairs': len(candidates), 'actual_public_source_cases_inspected': len(cases), 'private_production_images_inspected': 0,
               'limits': 'Counts are mapped records and unique stored paper/original-number families, not standalone readiness or independently verified curriculum coverage. Alias decisions concern wording only. Ambiguous labels retain original topic/tier partitions. No private-image or bank-wide question-content audit is claimed.'}
    (out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--rules', type=Path, default=Path('src/insightsSkillAliases.json'))
    parser.add_argument('--out', type=Path, default=Path('docs/insights-skill-audit'))
    parser.add_argument('--evidence', type=Path, default=Path('docs/insights-skill-audit/source-evidence.json'))
    parser.add_argument('--snapshot-date', required=True)
    parser.add_argument('--base-commit', required=True)
    args = parser.parse_args()
    result = generate(json.loads(args.snapshot.read_text()), json.loads(args.rules.read_text()), args.out,
                      evidence=json.loads(args.evidence.read_text()), snapshot_date=args.snapshot_date, base_commit=args.base_commit)
    result['snapshot_sha256'] = hashlib.sha256(args.snapshot.read_bytes()).hexdigest()
    result['rules_sha256'] = hashlib.sha256(args.rules.read_bytes()).hexdigest()
    (args.out / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

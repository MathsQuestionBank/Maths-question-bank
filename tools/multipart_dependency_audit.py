#!/usr/bin/env python3
"""Build a review-only inventory from an authorised, read-only JSON export.

No database connection, image download, crop mutation, or runtime selection code.
Metadata alone always yields uncertain; supplied observations remain unapproved.
"""
import argparse
import collections
import csv
import hashlib
import json
import re
from pathlib import Path

CLASSES = {'independent', 'dependent', 'shared_resource', 'uncertain'}
READINESS = {'ready', 'needs_crop', 'shared_context_needed', 'not_ready'}


def reference(row):
    match = re.fullmatch(r'Q?0*(\d+)([a-z]*)', row['question_number'], re.I)
    if not match:
        raise ValueError('Unrecognised printed reference: ' + row['id'])
    return int(match[1]), match[2].lower()


def fingerprint(path):
    # This fingerprints a stored reference, NOT the bytes of the image.
    return hashlib.sha256(path.encode()).hexdigest() if path else None


def validate_parts(parts, resource_ids=()):
    by_id = {p['database_record_id']: p for p in parts}
    if len(by_id) != len(parts):
        raise ValueError('Duplicate database record')
    for p in parts:
        if p['classification'] not in CLASSES or p['extraction_readiness'] not in READINESS:
            raise ValueError('Unknown classification/readiness')
        if p['review_status'] not in {'not_content_reviewed', 'source_only_provisional_not_teacher_approved'}:
            raise ValueError('Audit cannot grant teacher approval')
        if p['classification'] != 'uncertain' and p['evidence']['basis'] != 'public_source_counterpart':
            raise ValueError('Classification needs actual content evidence')
        if p['classification'] != 'uncertain' and (p['required_earlier_parts'] is None or p['required_shared_resources'] is None):
            raise ValueError('Reviewed requirements cannot be unknown')
        if any(resource not in resource_ids for resource in p['required_shared_resources'] or []):
            raise ValueError('Dangling shared resource')
        if p['classification'] == 'independent' and (p['required_earlier_parts'] or p['required_shared_resources']):
            raise ValueError('Independent part has unresolved external requirements')
        if p['classification'] == 'shared_resource' and not p['required_shared_resources']:
            raise ValueError('Shared-resource part lacks its resource')
        if p['classification'] == 'dependent' and not p['required_earlier_parts']:
            raise ValueError('Dependent part lacks prerequisites')
        if p['extraction_readiness'] != 'not_ready':
            raise ValueError('Private assets were not inspected; cannot assert bank crop readiness')
        for earlier in p['required_earlier_parts'] or []:
            if earlier not in by_id or by_id[earlier]['original_question_number'] != p['original_question_number']:
                raise ValueError('Dangling or cross-question dependency')
    visiting, visited = set(), set()

    def visit(key):
        if key in visiting:
            raise ValueError('Dependency cycle')
        if key in visited:
            return
        visiting.add(key)
        for parent in by_id[key]['required_earlier_parts'] or []:
            visit(parent)
        visiting.remove(key)
        visited.add(key)

    for key in by_id:
        visit(key)
    positions = {p['database_record_id']: i for i, p in enumerate(parts)}
    for p in parts:
        if any(positions[parent] >= positions[p['database_record_id']] for parent in p['required_earlier_parts'] or []):
            raise ValueError('Prerequisite must be an earlier part')


def build_inventory(rows, observations, locations, *, snapshot_date, base_commit):
    by_paper = collections.defaultdict(list)
    observed = {(p['series'], p['paper_code'], p['question_number'], p['part_suffix']): p for p in observations}
    if len(observed) != len(observations):
        raise ValueError('Duplicate source observation')
    located = {(q['series'], q['paper_code'], q['question_number']): q for q in locations}
    used, papers = set(), []
    for row in rows:
        if row['exam_board'] != 'Edexcel' or row['tier'] not in {'Foundation', 'Higher'}:
            raise ValueError('Export scope must be Edexcel GCSE Foundation/Higher')
        by_paper[row['paper_id']].append(row)
    for paper_id, records in sorted(by_paper.items(), key=lambda item: (item[1][0]['series'], item[1][0]['paper_code'])):
        source = records[0]
        for r in records:
            if any(r[k] != source[k] for k in ['series', 'paper_code', 'tier', 'exam_board']):
                raise ValueError('Inconsistent linked paper identity')
        groups = collections.defaultdict(list)
        for r in records:
            groups[reference(r)[0]].append(r)
        paper = {'paper_id': paper_id, 'exam_board': source['exam_board'], 'series': source['series'], 'paper_code': source['paper_code'], 'tier': source['tier'], 'mapped_record_count': len(records), 'whole_question_groups': len(groups), 'multipart_question_groups': sum(len(g) > 1 for g in groups.values()), 'private_asset_content_verified': False, 'teacher_approved': False, 'resources': {}, 'parts': []}
        for number, siblings in sorted(groups.items()):
            if len(siblings) < 2:
                continue
            siblings.sort(key=lambda row: reference(row)[1])
            by_suffix = {reference(r)[1]: r['id'] for r in siblings}
            if len(by_suffix) != len(siblings):
                raise ValueError('Duplicate mapped part label')
            for r in siblings:
                suffix = reference(r)[1]
                key = (r['series'], r['paper_code'], number, suffix)
                obs = observed.get(key)
                part = {'database_record_id': r['id'], 'source_question_id': r['source_id'], 'original_question_number': number, 'question_part': suffix, 'stored_question_reference': r['question_number'], 'marks': r['marks'], 'classification': 'uncertain', 'required_earlier_parts': None, 'required_shared_resources': None, 'extraction_readiness': 'not_ready', 'source_only_extraction_triage': None, 'question_asset_path_fingerprint': fingerprint(r['question_storage_path']), 'mark_asset_path_fingerprint': fingerprint(r['mark_scheme_storage_path']), 'existing_image_crops': r.get('image_crops'), 'existing_whole_image_crop_review': r.get('crop_review'), 'evidence': {'basis': 'metadata_only', 'note': 'Sibling mapping identifies a candidate only; content, prerequisites and standalone assets have not been verified.'}, 'confidence': 'unassessed', 'review_status': 'not_content_reviewed'}
                if obs:
                    used.add(key)
                    loc = located.get(key[:3])
                    if not loc or not loc['question_pdf_pages'] or not loc['mark_scheme_pdf_pages']:
                        raise ValueError('Source observation lacks question or marking location')
                    if r['marks'] != obs['source_marks']:
                        raise ValueError('Source/database mark allocation differs')
                    for resource in obs['shared_resources']:
                        resource_id = f"Q{number}:{resource['key']}"
                        paper['resources'][resource_id] = {'description': resource['description'], 'source_question': number, 'source_pdf_pages': loc['question_pdf_pages'], 'production_region_verified': False}
                    prereqs = None if obs['classification'] == 'uncertain' else [by_suffix[p] for p in obs['required_earlier_part_suffixes']]
                    shared = None if obs['classification'] == 'uncertain' else [f"Q{number}:{x['key']}" for x in obs['shared_resources']]
                    flags = obs['review_flags']
                    triage = 'needs_crop' if obs['classification'] == 'independent' else 'shared_context_needed' if obs['classification'] == 'shared_resource' else 'not_ready'
                    if 'marking_follow_through' in flags or 'physical_print_scale_required' in flags:
                        triage = 'not_ready'
                    part.update(classification=obs['classification'], required_earlier_parts=prereqs, required_shared_resources=shared, source_only_extraction_triage=triage, confidence=obs['confidence'], review_status=obs['review_status'], part_owned_context=obs['part_owned_context'], review_flags=flags, evidence={'basis': 'public_source_counterpart', 'question_pdf_pages': loc['question_pdf_pages'], 'mark_scheme_pdf_pages': loc['mark_scheme_pdf_pages'], 'mark_scheme_supplement_pages': loc.get('mark_scheme_supplement_pages', []) if 'mark_scheme_supplement' in flags else [], 'source_part_marks_verified': obs['source_marks'], 'question_observation': obs['evidence'], 'marking_observation': obs['marking_review'], 'private_question_asset_inspected': False, 'private_mark_asset_inspected': False, 'source_to_private_bytes_verified': False})
                paper['parts'].append(part)
        validate_parts(paper['parts'], paper['resources'])
        papers.append(paper)
    if used != set(observed):
        raise ValueError('Unmatched source observation: ' + repr(set(observed) - used))
    parts = [part for paper in papers for part in paper['parts']]
    classes = collections.Counter(p['classification'] for p in parts)
    evidence = collections.Counter(p['evidence']['basis'] for p in parts)
    readiness = collections.Counter(p['extraction_readiness'] for p in parts)
    source_triage = collections.Counter(p['source_only_extraction_triage'] for p in parts if p['source_only_extraction_triage'])
    shapes = collections.Counter()
    for paper in by_paper.values():
        g = collections.defaultdict(list)
        for row in paper:
            g[reference(row)[0]].append(row)
        for siblings in g.values():
            if len(siblings) > 1:
                shapes[f"question_assets={len({r['question_storage_path'] for r in siblings})};mark_assets={len({r['mark_scheme_storage_path'] for r in siblings})}"] += 1
    summary = {'version': 1, 'scope': 'Edexcel GCSE Foundation and Higher mapped-record inventory; actual total of printed multipart questions cannot be certified without the remaining source/asset inspection.', 'audit_status': 'partial_content_audit_private_asset_access_blocked', 'snapshot_date_utc': snapshot_date, 'base_commit': base_commit, 'paper_count': len(papers), 'mapped_record_count': len(rows), 'whole_question_groups': sum(p['whole_question_groups'] for p in papers), 'metadata_multipart_question_groups': sum(p['multipart_question_groups'] for p in papers), 'multipart_mapped_part_records': len(parts), 'source_question_groups_reviewed': len({key[:3] for key in used}), 'source_counterpart_parts_inspected': evidence['public_source_counterpart'], 'metadata_only_parts_not_content_inspected': evidence['metadata_only'], 'private_question_parts_inspected': 0, 'private_mark_scheme_parts_inspected': 0, 'teacher_approved_parts': 0, 'classification_counts_including_unapproved_source_proposals': dict(classes), 'production_extraction_readiness_counts': {k: readiness[k] for k in ['ready', 'needs_crop', 'shared_context_needed', 'not_ready']}, 'source_only_extraction_triage_counts': dict(source_triage), 'private_asset_review_required_parts': len(parts), 'asset_reference_shapes': dict(shapes), 'interpretation': 'Source-backed proposals are not production-image verification or teacher approval. Unknown prerequisite/resource arrays are null, not empty. Every bank extraction remains not_ready; no app consumes this report.'}
    return summary, papers


def write_reports(summary, papers, out):
    (out / 'papers').mkdir(parents=True, exist_ok=True)
    (out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    uncertain = []
    table = ['# Paper inventory and review index', '', 'Counts identify mapped multipart candidates, not proof that all printed parts were imported. All source-only observations require private-asset and teacher review. No part is approved for extraction.', '', '| Paper | Mapped records | Whole groups | Multipart groups | Multipart records | Source-content inspected |', '|---|---:|---:|---:|---:|---:|']
    for paper in papers:
        name = paper['series'].lower().replace(' ', '-') + '-' + paper['paper_code'].lower() + '.json'
        (out / 'papers' / name).write_text(json.dumps(paper, indent=2) + '\n')
        examined = sum(p['evidence']['basis'] == 'public_source_counterpart' for p in paper['parts'])
        table.append(f"| [{paper['series']} {paper['paper_code']} — {paper['tier']}](papers/{name}) | {paper['mapped_record_count']} | {paper['whole_question_groups']} | {paper['multipart_question_groups']} | {len(paper['parts'])} | {examined} |")
        for p in paper['parts']:
            if p['classification'] == 'uncertain':
                uncertain.append([paper['exam_board'], paper['series'], paper['paper_code'], paper['tier'], p['original_question_number'], p['question_part'], p['source_question_id'], p['database_record_id'], p['evidence']['basis'], p['evidence'].get('question_observation', p['evidence'].get('note')), p['review_status']])
    (out / 'paper-index.md').write_text('\n'.join(table) + '\n')
    with (out / 'uncertain-parts.csv').open('w', newline='') as f:
        writer = csv.writer(f, lineterminator='\n')
        writer.writerow(['Exam board', 'Series', 'Paper', 'Tier', 'Original question', 'Part (raw suffix)', 'Source question ID', 'Database record ID', 'Evidence basis', 'Reason for uncertainty', 'Review status'])
        writer.writerows(uncertain)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalogue', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, default=Path('docs/multipart-dependency-audit'))
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--snapshot-date', required=True, help='UTC date of the authorised metadata snapshot, YYYY-MM-DD')
    parser.add_argument('--base-commit', required=True, help='Application main commit inspected for this audit')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.snapshot_date):
        parser.error('Snapshot date must be YYYY-MM-DD')
    rows = json.loads(args.catalogue.read_text())
    obs = json.loads((args.evidence / 'source-observations.json').read_text())['parts']
    loc = json.loads((args.evidence / 'source-locations.json').read_text())['questions']
    summary, papers = build_inventory(rows, obs, loc, snapshot_date=args.snapshot_date, base_commit=args.base_commit)
    summary['metadata_snapshot_sha256'] = hashlib.sha256(args.catalogue.read_bytes()).hexdigest()
    write_reports(summary, papers, args.out)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()

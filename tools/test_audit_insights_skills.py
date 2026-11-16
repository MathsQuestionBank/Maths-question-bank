import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from audit_insights_skills import generate

ROOT = Path(__file__).resolve().parents[1]
RULES = json.loads((ROOT / 'src/insightsSkillAliases.json').read_text())

def record(id, ref, skill, topic='Algebra'):
    return dict(id=id, paper_id='paper', source_id='source-' + id, series='June 2022', paper_code='1F', tier='Foundation', question_number=ref, skill=skill, topic=topic, original_skill=None, specification=None)

class LabelAuditTests(unittest.TestCase):
    def test_aliases_count_unique_records_and_whole_questions(self):
        records = [record('a', '1a', 'Solve linear equations; Solve a linear equation'), record('b', '1b', 'Solve a linear equation', 'Number')]
        with tempfile.TemporaryDirectory() as folder:
            summary = generate(records, RULES, Path(folder))
            row = json.loads((Path(folder) / 'canonical-coverage.json').read_text())[0]
            self.assertEqual((row['mapped_records'], row['whole_questions']), (2, 1))
            self.assertEqual(summary['actual_public_source_cases_inspected'], 0)
            self.assertEqual(summary['coverage_rows_after'], 1)

    def test_broad_or_truncated_labels_are_not_semantically_merged(self):
        records = [record('a', '1', 'Solving equations'), record('b', '2', 'Solving equations', 'Number'), record('c', '3', 'Solve linear equations'), record('d', '4', 'Solve quadratic equations'), record('e', '5', 'Solve quad...')]
        with tempfile.TemporaryDirectory() as folder:
            summary = generate(records, RULES, Path(folder))
            self.assertEqual(summary['coverage_rows_after'], 5)
            self.assertEqual(summary['unresolved_records'], 3)

    def test_source_evidence_must_match_real_snapshot_records(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'Source case'):
                generate([record('a', '1', 'Solving equations')], RULES, Path(folder), evidence={'cases': [{'database_record_id': 'missing', 'paper_id': 'paper', 'stored_question_reference': '1'}]})

    def test_committed_census_and_unique_union_counts(self):
        path = ROOT / 'docs/insights-skill-audit'
        s = json.loads((path / 'summary.json').read_text())
        self.assertEqual((s['mapped_records'], s['papers'], s['whole_question_groups']), (3181, 90, 2257))
        self.assertEqual(s['controlled_wording_groups'], len(RULES['groups']))
        self.assertEqual(s['rules_sha256'], hashlib.sha256((ROOT / 'src/insightsSkillAliases.json').read_bytes()).hexdigest())
        self.assertEqual((s['complete_raw_skill_fields'], s['raw_semicolon_tokens_including_spacing_variants']), (672, 720))
        self.assertEqual((s['generic_solving_equations_records'], s['unresolved_records']), (97, 121))
        self.assertEqual((s['actual_public_source_cases_inspected'], s['private_production_images_inspected']), (3, 0))
        rows = json.loads((path / 'canonical-coverage.json').read_text())
        self.assertEqual(len(rows), s['coverage_rows_after'])
        collecting = next(r for r in rows if r['canonical_id'] == 'canonical:collect-like-terms')
        self.assertEqual((collecting['mapped_records'], collecting['whole_questions']), (12, 10))
        self.assertEqual(len({r['row_key'] for r in rows}), len(rows))

if __name__ == '__main__':
    unittest.main()

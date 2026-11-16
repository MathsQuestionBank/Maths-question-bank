import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'tools/multipart_dependency_audit.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def record(id, label, **extra):
    return {'id': id, 'paper_id': 'paper', 'exam_board': 'Edexcel', 'series': 'Fixture series', 'paper_code': '1H', 'tier': 'Higher', 'question_number': label, 'marks': 2, 'source_id': 'FIXTURE-' + label, 'question_storage_path': 'private/publisher-id/' + id, 'mark_scheme_storage_path': 'private/publisher-id/marks/' + id, **extra}


def inventory(rows, obs=(), loc=()):
    return audit.build_inventory(rows, obs, loc, snapshot_date='2026-11-16', base_commit='fixture')


def reviewed(id, classification='independent', earlier=(), shared=()):
    return {'database_record_id': id, 'original_question_number': 1, 'classification': classification, 'required_earlier_parts': list(earlier), 'required_shared_resources': list(shared), 'extraction_readiness': 'not_ready', 'evidence': {'basis': 'public_source_counterpart'}, 'review_status': 'source_only_provisional_not_teacher_approved'}


class AuditTests(unittest.TestCase):
    def test_metadata_never_classifies_independence_even_with_distinct_assets_skills_or_grades(self):
        summary, papers = inventory([record('a', 'Q1a', skill='Algebra', grade=3), record('b', 'Q1b', skill='Geometry', grade=7)])
        self.assertEqual(summary['classification_counts_including_unapproved_source_proposals'], {'uncertain': 2})
        self.assertEqual(summary['source_counterpart_parts_inspected'], 0)
        for p in papers[0]['parts']:
            self.assertIsNone(p['required_earlier_parts'])
            self.assertIsNone(p['required_shared_resources'])
            self.assertEqual(p['extraction_readiness'], 'not_ready')

    def test_groups_nested_suffixes_without_guessing_their_nesting_or_dropping_single_records(self):
        summary, papers = inventory([record('a', 'Q06ai'), record('b', 'Q06aii'), record('c', 'Q7')])
        self.assertEqual(summary['mapped_record_count'], 3)
        self.assertEqual(summary['whole_question_groups'], 2)
        self.assertEqual([p['question_part'] for p in papers[0]['parts']], ['ai', 'aii'])

    def test_safe_reports_fingerprint_private_paths_instead_of_publishing_them(self):
        summary, papers = inventory([record('a', 'Q1a'), record('b', 'Q1b')])
        with tempfile.TemporaryDirectory() as out:
            audit.write_reports(summary, papers, Path(out))
            files = list(Path(out).rglob('*'))
            for p in files:
                if p.is_file():
                    self.assertNotIn('publisher-id', p.read_text())
                    self.assertNotIn('private/', p.read_text())
            self.assertTrue((Path(out) / 'uncertain-parts.csv').exists())

    def test_directional_chains_are_supported_and_cycles_rejected(self):
        chain = [reviewed('a'), reviewed('b', 'dependent', ['a']), reviewed('c', 'dependent', ['b'])]
        audit.validate_parts(chain)
        chain[0] = reviewed('a', 'dependent', ['c'])
        with self.assertRaisesRegex(ValueError, 'cycle'):
            audit.validate_parts(chain)

    def test_dangling_later_and_cross_question_dependencies_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Dangling'):
            audit.validate_parts([reviewed('b', 'dependent', ['missing'])])
        with self.assertRaisesRegex(ValueError, 'earlier'):
            audit.validate_parts([reviewed('a', 'dependent', ['b']), reviewed('b')])
        wrong = reviewed('a'); wrong['original_question_number'] = 2
        with self.assertRaisesRegex(ValueError, 'cross-question'):
            audit.validate_parts([wrong, reviewed('b', 'dependent', ['a'])])

    def test_shared_resources_must_exist_and_independent_requirements_must_be_known(self):
        shared = reviewed('a', 'shared_resource', shared=['diagram'])
        with self.assertRaisesRegex(ValueError, 'Dangling shared'):
            audit.validate_parts([shared])
        audit.validate_parts([shared], {'diagram'})
        bad = reviewed('b'); bad['required_earlier_parts'] = None
        with self.assertRaisesRegex(ValueError, 'cannot be unknown'):
            audit.validate_parts([bad])

    def test_report_cannot_grant_teacher_approval_or_assert_private_extraction_readiness(self):
        for changes in [{'review_status': 'approved'}, {'extraction_readiness': 'ready'}, {'extraction_readiness': 'needs_crop'}, {'evidence': {'basis': 'metadata_only'}}]:
            part = {**reviewed('a'), **changes}
            with self.assertRaises(ValueError):
                audit.validate_parts([part])

    def test_committed_inventory_counts_and_evidence_totals_match_every_paper(self):
        base = ROOT / 'docs/multipart-dependency-audit'
        summary = json.loads((base / 'summary.json').read_text())
        papers = [json.loads(p.read_text()) for p in (base / 'papers').glob('*.json')]
        parts = [p for paper in papers for p in paper['parts']]
        self.assertEqual(len(papers), 90)
        self.assertEqual(len(parts), 1656)
        self.assertEqual(sum(p['mapped_record_count'] for p in papers), 3181)
        self.assertEqual(sum(p['multipart_question_groups'] for p in papers), 732)
        self.assertEqual(sum(p['evidence']['basis'] == 'public_source_counterpart' for p in parts), 91)
        self.assertEqual(sum(p['classification'] == 'uncertain' for p in parts), 1568)
        self.assertEqual(summary['production_extraction_readiness_counts'], {'ready': 0, 'needs_crop': 0, 'shared_context_needed': 0, 'not_ready': 1656})
        for paper in papers:
            audit.validate_parts(paper['parts'], paper['resources'])
            self.assertFalse(paper['teacher_approved'])
            self.assertFalse(paper['private_asset_content_verified'])

    def test_read_only_sql_is_a_select_without_auth_or_personal_fields(self):
        sql = (ROOT / 'tools/multipart_dependency_snapshot.sql').read_text()
        statements = '\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
        self.assertTrue(statements.lstrip().lower().startswith('select'))
        self.assertNotRegex(statements.lower(), r'\b(update|insert|delete|alter|create|grant|revoke|auth\.users|published_by)\b')


if __name__ == '__main__':
    unittest.main()

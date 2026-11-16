# Private multipart audit exports

This owner tool supplies the image access missing from the [PR #93 audit](multipart-dependency-audit/README.md). It exports stored material for **local review only**. It does not classify dependencies, approve individual parts, edit crops or change assessments.

## Owner workflow

1. Sign in with the existing approved owner account. Open **Account → Export multipart audit images**.
2. Choose an Edexcel GCSE Foundation or Higher paper. Only that paper's question records are loaded into this view. Paper identity comes from the linked examination record, not a year-only image filename.
3. Select up to **10 complete multipart families**. Each row shows original question number, mapped part/source IDs and marks. “Select first 10 available” is a shortcut; clear or change the selection for later batches. Families missing a question or marking reference are unavailable.
4. Click **Download audit ZIP**. Keep the tab open, or use **Cancel export**. A ZIP is offered only when every distinct referenced question and marking image has downloaded and decoded successfully. A failed batch produces an error and **no partial archive**. Retry the download or reduce the batch.
5. Move the ZIP to a private local folder **outside the repository and public/cloud-synchronised folders**. The filename identifies the series, paper and selected original numbers. Open `READ-ME.txt` and `manifest.json` before reviewing the images.

The tool downloads the **original stored bytes**: no resize, crop, mask, recompression or numbering replacement. Width/height and SHA-256 are recorded. Existing crop percentages are included separately and are **not applied**. Shared images are included once; all parts point to the appropriate image entries. Distinct sibling question/marking images are retained. Limits are 80 distinct assets, 20 MB per image and 100 MB original bytes per batch; ZIP generation also needs browser memory. PNG, JPEG, GIF and WebP raster assets are supported. Other formats, invalid references or unrecognised crop metadata fail explicitly rather than being silently converted or omitted.

“Complete” means **all referenced assets for all selected mapped records**. It does not prove the import captured every printed subpart, all required context or all marking supplements. Whole-image crop approval is not approval of an isolated part. A teacher must still verify each proposed standalone question and its marking instructions.

## Manifest version 1

`format` is `mathsquestionbank.multipart-audit-export`; `schema_version` is `1`. No raw metadata, user identity, bucket keys, public URLs, signed URLs, access tokens or credentials are serialized.

| Field | Meaning |
|---|---|
| `created_at_utc`, `complete`, `review_status` | Export time; all referenced assets included; always `unreviewed_not_teacher_approved` |
| `paper` | Existing paper UUID, board, qualification, series, code and tier |
| `question_count`, `part_count`, `asset_count`, `original_bytes_total` | Counts of families, mapped records, distinct stored assets and original bytes |
| `groups[].audit_family_key` | Composite paper UUID plus `Q` and original number; the same family identity used by the audit, not an inferred dependency |
| `groups[].original_question_number`, `marks` | Original number and sum of known part marks; total is null if any allocation is missing/invalid |
| `groups[].parts[].database_record_id` | Exact UUID joining to `database_record_id` in the PR #93 paper reports |
| `source_question_id`, `stored_question_reference`, `question_part` | Original imported source ID, stored printed reference and raw lower-case suffix (including nested forms such as `aii`); missing source IDs stay null |
| `marks` | Stored part allocation; missing allocations stay null |
| `existing_image_crops` | Existing `metadata.image_crops` question/mark edge percentages, unchanged; absent values stay null rather than being defaulted to zero |
| `existing_whole_image_crop_review` | Existing question/mark review strings, unchanged; absent values stay null |
| `question_asset`, `mark_scheme_asset` | References to IDs in `assets`, not paths to be guessed from filenames |
| `assets[].id`, `file` | Export-local stable mapping to a relative filename such as `assets/asset-001.png`; never derived from a private Storage key |
| `source_path_sha256` | SHA-256 of the UTF-8 stored path, matching the audit's question/mark path fingerprints. **Not** a hash of content |
| `sha256`, `byte_length`, `width`, `height` | Hash and size of original downloaded bytes, plus decoded pixel dimensions |

The ZIP contains `manifest.json`, `READ-ME.txt` and `assets/`. No classifier consumes it automatically. The published audit remains an immutable historical snapshot; a changed asset fingerprint or record/mark allocation needs reconciliation before extending its findings.

## Local use with Codex

Use a private, approved local Codex workspace with the extracted batch available read-only. Keep the export outside the Git checkout, for example `~/private-mqb-audit/november-2022-3h/`. Do not place it in `docs/`, test fixtures, `public/` or a shared drive. The repository also ignores `private-audit-exports/` and `multipart-audit-*.zip` / `multipart-audit-*/` as a backstop; ignore rules are not a substitute for keeping material outside Git.

After extracting with your local archive utility, verify the bytes and links before opening an image. This Python example reads only the extracted files and committed audit reports; it performs no network access or writes:

```python
import hashlib, json
from pathlib import Path

batch = Path.home() / "private-mqb-audit" / "november-2022-3h"
reports = Path("docs/multipart-dependency-audit/papers")  # run from repository root
m = json.loads((batch / "manifest.json").read_text())
assert m["format"] == "mathsquestionbank.multipart-audit-export"
assert m["schema_version"] == 1 and m["complete"] is True
assets = {a["id"]: a for a in m["assets"]}
for a in assets.values():
    file = (batch / a["file"]).resolve()
    assert file.is_relative_to(batch.resolve())
    data = file.read_bytes()
    assert len(data) == a["byte_length"]
    assert hashlib.sha256(data).hexdigest() == a["sha256"]
paper = next(p for path in reports.glob("*.json")
             if (p := json.loads(path.read_text()))["paper_id"] == m["paper"]["paper_id"])
old = {p["database_record_id"]: p for p in paper["parts"]}
for group in m["groups"]:
    for part in group["parts"]:
        prior = old[part["database_record_id"]]
        assert prior["original_question_number"] == group["original_question_number"]
        assert prior["stored_question_reference"] == part["stored_question_reference"]
        assert prior["marks"] == part["marks"]
        for field, fingerprint in [("question_asset", "question_asset_path_fingerprint"),
                                   ("mark_scheme_asset", "mark_asset_path_fingerprint")]:
            assert assets[part[field]]["source_path_sha256"] == prior[fingerprint]
print("Bytes, record links and historical path fingerprints verified.")
```

This snippet needs Python 3.9+. A failed assertion is a review signal: do not rename images, infer mappings or silently overwrite an old finding. New records absent from the historical audit need a new inventory entry. A matching path fingerprint does not prove the object bytes are unchanged since PR #93, because that audit could not inspect private bytes. These new content hashes establish a baseline for subsequent reviews.

An appropriate review prompt is:

> Read this batch's manifest and inspect the actual question and matching mark scheme images. Join findings by paper UUID and database record ID to the existing audit. Distinguish earlier student answers/work from supplied shared context. Preserve raw labels, marks, original numbering and all marking guidance. Record directional prerequisites, source-region evidence and uncertainty. Keep every finding provisional and unapproved pending human teacher review. Do not write Supabase, edit images/crops, change assessment code or commit any image, ZIP, signed URL or credential. Keep detailed working notes private; prepare only reviewed, image-free audit observations for a later PR.

Inspect each **full original image and its existing crop boundaries**; do not start at a part marker and assume context above it is irrelevant. Include all distinct marking assets and look for separate guidance/supplement diagrams. Shared images do not imply answer dependencies, and separate images do not imply independence. The export itself grants no approval to split a question.

## Authentication and data handling

- The Account entry and component use the existing verified owner role. Data loading and export also call `auth.getUser()` and the live `is_approved_owner` database RPC, fail closed on errors, and require the same user throughout the operation. User-editable `user_metadata` is never used for authorisation. Checks run before each distinct download, after ZIP generation and immediately before offering it.
- Image reads use the existing authenticated Supabase Storage `download` API and existing RLS in `exam-materials-private`. No bucket, policy, account, schema or permission changes are introduced. The owner-only workflow does not revoke approved teachers' existing individual-image read permissions or create a new privileged download endpoint.
- Expired preview signing links are ignored entirely. The SDK uses the current authenticated session instead. Each read has a 45-second timeout and at most one retry after a fresh owner check. Cancellation, sign-out, account changes, revoked owner approval, missing images, corrupt responses or size limits prevent archive release. Revocation cannot retract an archive already downloaded.
- Only selected original question families are exported. Records are reloaded at export time, rather than trusting stale UI state; source/crop metadata is a snapshot and may need reconciliation after later bank changes.
- Generation happens in browser memory. The application does not upload the ZIP, persist it in localStorage/IndexedDB, log image bytes/URLs or use an additional service. The temporary browser object URL is revoked after initiating the download. Browser Downloads, backups, extensions and the review environment remain under the owner's control.
- Examine data-handling settings before sharing with Codex or any hosted review tool, including retention, access, training and deletion controls. Do not include pupil/student data, credentials, signed links or session exports. Use the existing authorised browser login; do not share a service-role key or make a bucket public.
- Examination material remains subject to copyright and applicable Pearson/Edexcel and school licensing terms. Access in MathsQuestionBank does **not** itself establish permission to redistribute or upload material to an external AI service. Check the relevant permissions first; keep review local if external processing is not authorised. Do not publish full examination images or downloaded archives in GitHub issues, PRs, CI artifacts or public documents.
- Keep only the batches needed for the review. Apply your school's retention/deletion requirements to extracted files, Downloads, attachments and backups; deleting a local file does not guarantee deletion of provider-held copies.

## Verification and limits

Automated tests use clearly identified **synthetic** raster images and intercepted authenticated requests. They inspect an actual downloaded ZIP on desktop/mobile, verify every byte/hash/record mapping and test signed-out/unapproved/teacher/forged-metadata/stale-owner cases, revocation, cancellation and failed-download handling. Unit tests additionally cover pagination, nested labels, missing metadata, batch limits, timeout/retry, unsupported assets, source fingerprints and fresh export snapshots.

A read-only production catalogue check confirmed `exam-materials-private.public = false`, Storage RLS enabled and the owner RPC backed by database profiles. No production question/image writes or actual private production downloads were performed for verification. An owner should validate the first authorised real batch and its local review permissions before extending the content audit; synthetic test success is not verification of private question content or missing supplements.

Validation results and desktop/mobile fixture screenshots are linked in the pull request. No examination images, ZIPs, signed URLs or credentials are committed as examples.

## Fixture screenshots and results

These screenshots contain **synthetic record labels only**, with no examination question/mark scheme images or private URLs. The ZIP tests generate synthetic raster assets in memory; no exported archive is committed.

[Desktop selection](audit-export-examples/desktop.png) · [Mobile selection](audit-export-examples/mobile.png)

Local checks passed: `npm run build` (existing bundle-size advisory), `npm test` (311 tests across 30 files), `npm run test:smoke` (76 passed, 12 existing skips), and the nine PR #93 audit unittests. After the final UI/manifest formatting changes, the build, unit suite and 16 focused desktop/mobile export smoke cases also passed. GitHub CI status is recorded in the PR. No pre-existing test failures were observed.

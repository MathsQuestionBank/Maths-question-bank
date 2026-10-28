#!/usr/bin/env bash
# Isolated synthetic database only. No production URL, credentials or ports.
set -Eeuo pipefail
trap 'echo "::error file=tools/test-publication-sql.sh,line=$LINENO::Publication SQL test command failed: $BASH_COMMAND"' ERR
cd "$(dirname "$0")/.."
for dependency in docker grep mktemp; do command -v "$dependency" >/dev/null || { echo "Missing test dependency: $dependency" >&2;exit 1; };done
local_docker() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
container="maths-qb-sql-test-$$"
logs="$(mktemp -d)"
cleanup() { local_docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$logs"; }
trap cleanup EXIT
local_docker run --network none -d --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17@sha256:31ba9c94a03ada9988f2bb493a22a75eef3a185884533e5cdbcd498ea835b08f >/dev/null
for attempt in {1..100}; do
 if local_docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' && local_docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep .2
done
sql() { local_docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
sql < tools/sql/publication-fixture.sql
if sql < docs/v16-preserve-enhanced-publication-metadata.sql >"$logs/preflight" 2>&1; then
 echo 'FAIL: V16 accepted missing V15 prerequisites' >&2; exit 1
fi
grep -q 'Apply and verify V1.5' "$logs/preflight"
sql < docs/v15-atomic-reviewed-paper-publication.sql
sql < tools/sql/v15-publication.sql
sql < docs/v16-preserve-enhanced-publication-metadata.sql
sql < docs/v16-preserve-enhanced-publication-metadata.sql
sql < tools/sql/publication-tests.sql
# Force concurrent requests past the initial duplicate lookup before either insert commits.
sql <<'SQL'
insert into storage.objects
select 'exam-materials-private',v->>'question_path' from jsonb_array_elements(test_items('2F')) v union all
select 'exam-materials-private',v->>'mark_path' from jsonb_array_elements(test_items('2F')) v union all
select 'exam-materials-private','new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/2F/11111111-1111-4111-8111-111111111111/extraction-review.json';
create function delay_paper() returns trigger language plpgsql as $$begin if new.paper_code='2F' then perform pg_sleep(1);end if;return new;end;$$;
create trigger delay_paper before insert on exam_papers for each row execute function delay_paper();
SQL
request="set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set test.approved='true';set role authenticated;select test_publish(test_items('2F'),'Edexcel','2F','new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/2F/11111111-1111-4111-8111-111111111111/extraction-review.json');"
sql <<<"$request" >"$logs/one" 2>&1 & first=$!
sql <<<"$request" >"$logs/two" 2>&1 & second=$!
one=0;two=0
wait "$first" || one=$?
wait "$second" || two=$?
if [[ "$one" -eq 0 && "$two" -ne 0 ]]; then grep -q 'duplicate key|already published' "$logs/two"
elif [[ "$two" -eq 0 && "$one" -ne 0 ]]; then grep -q 'duplicate key|already published' "$logs/one"
else cat "$logs/one" "$logs/two";echo 'FAIL: expected exactly one concurrent publication';exit 1;fi
sql <<'SQL'
do $$begin
 if (select count(*) from exam_papers where paper_code='2F')<>1 or
    (select count(*) from questions where paper_id in(select id from exam_papers where paper_code='2F'))<>4 then raise exception 'Concurrent duplicate or partial publication';end if;
end;$$;
SQL
echo 'PASS: V15 compatibility, repeatable V16, validation, rollback, existing-data preservation and concurrent duplicate rejection'

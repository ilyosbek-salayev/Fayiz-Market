#!/usr/bin/env bash
set -euo pipefail
probe=$(mktemp -d)
printf 'preserve\n' > "$probe/sentinel"
if bash scripts/deploy-qa/local-worker.sh "$probe" >/dev/null 2>&1; then
  echo 'FAIL existing QA directory was accepted'; exit 1
fi
test "$(cat "$probe/sentinel")" = preserve
echo 'PASS existing QA directory refused and sentinel preserved'

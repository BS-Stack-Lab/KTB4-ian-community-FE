#!/usr/bin/env bash

set -Eeuo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
failures=0
while IFS= read -r use_line; do
  [[ "${use_line}" == *'uses: ./'* ]] && continue
  if [[ ! "${use_line}" =~ @[0-9a-f]{40}[[:space:]]*#[[:space:]]*v[0-9] ]]; then
    echo "Unpinned or undocumented external Action: ${use_line}" >&2
    failures=$((failures + 1))
  fi
done < <(grep -RhE '^[[:space:]]*-[[:space:]]+uses:' "${root}/.github/workflows")

if grep -RInE 'pull_request_target|:[[:space:]]*latest([[:space:]]|$)' "${root}/.github/workflows"; then
  echo "Forbidden workflow trigger or mutable image tag found." >&2
  failures=$((failures + 1))
fi
if grep -RInE 'merge_group:|repository_dispatch:|workflow_call:|PRODUCTION_DEPLOY_ENABLED|PRODUCTION_DISPATCH_ENABLED|BACKEND_DISPATCH_TOKEN|dispatch-backend' "${root}/.github/workflows"; then
  echo "Unsupported merge queue or cross-repository production dispatch behavior found." >&2
  failures=$((failures + 1))
fi
ci_workflow="${root}/.github/workflows/ci.yml"
if ! grep -qE '^  pull_request:$' "${ci_workflow}" ||
  ! grep -qE '^    types: \[opened, synchronize, reopened, ready_for_review\]$' "${ci_workflow}" ||
  ! grep -qE '^  push:$' "${ci_workflow}" ||
  grep -qE '^  workflow_dispatch:$' "${ci_workflow}"; then
  echo "Frontend CI must run automatically for main pull requests and main pushes only." >&2
  failures=$((failures + 1))
fi
if ! grep -qE '^    name: FE / required-gate$' "${ci_workflow}"; then
  echo "Frontend required gate name changed." >&2
  failures=$((failures + 1))
fi
if ! grep -qE 'ghcr\.io/bs-stack-lab/ktb4-ian-community-fe' "${root}/.github/workflows/publish-image.yml"; then
  echo "Frontend publisher does not target the personal GHCR namespace." >&2
  failures=$((failures + 1))
fi
[[ "${failures}" -eq 0 ]] || exit 1
echo "PASS: Frontend workflows enforce PR CI, immutable publication, and no automatic deployment."

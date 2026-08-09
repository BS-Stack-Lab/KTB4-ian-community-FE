#!/usr/bin/env bash

set -Eeuo pipefail

: "${APP_VERSION:?Set APP_VERSION to the exact 40-character commit SHA}"
[[ "${APP_VERSION}" =~ ^[0-9a-f]{40}$ ]]

checksum_command=()
if command -v sha256sum >/dev/null 2>&1; then
  checksum_command=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  checksum_command=(shasum -a 256)
else
  echo "SHA-256 utility is required" >&2
  exit 1
fi

snapshot() {
  find build -type f -print0 \
    | sort -z \
    | xargs -0 "${checksum_command[@]}"
}

first="$(mktemp)"
second="$(mktemp)"
cleanup() { rm -f "${first}" "${second}"; }
trap cleanup EXIT

[[ -f build/version.json ]] || APP_VERSION="${APP_VERSION}" npm run build:react
snapshot >"${first}"
APP_VERSION="${APP_VERSION}" npm run build:react >/dev/null
snapshot >"${second}"
cmp --silent "${first}" "${second}" || {
  diff --unified "${first}" "${second}" >&2 || true
  echo "FAIL: identical source produced different web roots" >&2
  exit 1
}

echo "PASS: identical source and version produced the same content hashes."

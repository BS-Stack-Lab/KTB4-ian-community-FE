#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

checksum_file() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file_path}"
  else
    shasum -a 256 "${file_path}"
  fi
}

require_command docker
require_command git

commit_sha="$(git -C "${REPOSITORY_ROOT}" rev-parse --short=12 HEAD)"
image_tag="${IMAGE_TAG:-community-frontend:${commit_sha}}"
platform="${PLATFORM:-linux/amd64}"

if [[ "${platform}" != "linux/amd64" ]]; then
  echo "EC2 release images must target linux/amd64, received: ${platform}" >&2
  exit 1
fi

docker buildx inspect >/dev/null
docker buildx build \
  --platform "${platform}" \
  --load \
  --tag "${image_tag}" \
  "${REPOSITORY_ROOT}"

actual_platform="$(
  docker image inspect \
    --platform linux/amd64 \
    --format '{{.Os}}/{{.Architecture}}' \
    "${image_tag}"
)"
if [[ "${actual_platform}" != "linux/amd64" ]]; then
  echo "Unexpected image platform: ${actual_platform}" >&2
  exit 1
fi

echo "Built ${image_tag} (${actual_platform})"

if [[ "${EXPORT_TAR:-0}" == "1" ]]; then
  require_command mkdir
  output_dir="${OUTPUT_DIR:-${REPOSITORY_ROOT}/artifacts}"
  mkdir -p "${output_dir}"
  archive_name="${image_tag//\//-}"
  archive_name="${archive_name//:/-}.tar"
  archive_path="${output_dir}/${archive_name}"
  docker save --output "${archive_path}" "${image_tag}"
  checksum_file "${archive_path}" >"${archive_path}.sha256"
  echo "Exported ${archive_path}"
fi

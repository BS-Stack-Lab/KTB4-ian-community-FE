#!/usr/bin/env bash

set -Eeuo pipefail

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command docker

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
image_tag="${IMAGE_TAG:?Set IMAGE_TAG to the frontend image to verify}"
suffix="${RANDOM}-$$"
network_name="community-frontend-verify-${suffix}"
backend_name="backend-${suffix}"
frontend_name="frontend-${suffix}"
stub_root="$(mktemp -d "${SCRIPT_DIR}/.verify-backend.XXXXXX")"

cleanup() {
  docker rm --force "${frontend_name}" "${backend_name}" \
    >/dev/null 2>&1 || true
  docker network rm "${network_name}" >/dev/null 2>&1 || true
  rm -rf -- "${stub_root}"
}
trap cleanup EXIT

mkdir -p "${stub_root}/api"
printf 'backend\n' >"${stub_root}/api/index.html"

platform="$(
  docker image inspect \
    --platform linux/amd64 \
    --format '{{.Os}}/{{.Architecture}}' \
    "${image_tag}"
)"
[[ "${platform}" == "linux/amd64" ]] || {
  echo "FAIL: expected linux/amd64, found ${platform}" >&2
  exit 1
}

runtime_user="$(
  docker image inspect --format '{{.Config.User}}' "${image_tag}"
)"
[[ -n "${runtime_user}" && "${runtime_user}" != "0" ]] || {
  echo "FAIL: frontend runtime image is configured as root" >&2
  exit 1
}

docker network create "${network_name}" >/dev/null
docker run --detach \
  --name "${backend_name}" \
  --network "${network_name}" \
  --network-alias backend \
  --volume "${stub_root}:/www:ro" \
  busybox:1.37 \
  httpd -f -p 8080 -h /www >/dev/null

if [[ "$(docker inspect --format '{{.State.Running}}' "${backend_name}")" != "true" ]]; then
  echo "FAIL: backend verification stub did not start" >&2
  exit 1
fi

stub_ready=false
for _ in {1..10}; do
  if docker exec "${backend_name}" \
    wget --quiet --output-document=- \
    http://127.0.0.1:8080/api/index.html |
    grep -qx 'backend'; then
    stub_ready=true
    break
  fi
  sleep 1
done
[[ "${stub_ready}" == "true" ]] || {
  echo "FAIL: backend verification stub did not serve its fixture" >&2
  exit 1
}

docker run --detach \
  --platform linux/amd64 \
  --name "${frontend_name}" \
  --network "${network_name}" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  "${image_tag}" >/dev/null

ready=false
for _ in {1..30}; do
  if docker exec "${frontend_name}" \
    wget --quiet --tries=1 --spider http://127.0.0.1/healthz \
    2>/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
[[ "${ready}" == "true" ]] || {
  docker logs --tail 50 "${frontend_name}" >&2 || true
  echo "FAIL: frontend health endpoint did not become ready" >&2
  exit 1
}

if ! docker exec "${frontend_name}" \
  wget --quiet --output-document=- \
  http://127.0.0.1/route/that/needs/spa |
  grep -q 'id="root"'; then
  echo "FAIL: SPA fallback did not return index.html" >&2
  exit 1
fi

if ! docker exec "${frontend_name}" \
  wget --quiet --output-document=- http://127.0.0.1/api/index.html |
  grep -qx 'backend'; then
  echo "FAIL: /api reverse proxy did not reach the backend stub" >&2
  exit 1
fi

if ! docker exec "${frontend_name}" \
  wget --server-response --spider http://127.0.0.1/dist/app.js \
  2>&1 |
  tr -d '\r' |
  grep -Eiq '^[[:space:]]*Cache-Control: .*immutable'; then
  echo "FAIL: static asset cache header is missing" >&2
  exit 1
fi

docker exec "${frontend_name}" nginx -t >/dev/null
if docker exec "${frontend_name}" sh -c 'command -v node >/dev/null'; then
  echo "FAIL: Node.js exists in the runtime image" >&2
  exit 1
fi

echo "PASS: ${image_tag} is linux/amd64, non-root, SPA-ready, and proxies /api."

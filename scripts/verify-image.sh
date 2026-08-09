#!/usr/bin/env bash

set -Eeuo pipefail

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

http_status() {
  docker exec "${container_name}" wget --server-response --spider "$1" 2>&1 \
    | tr -d '\r' \
    | sed -nE 's/.*HTTP\/[0-9.]+[[:space:]]+([0-9]{3}).*/\1/p' \
    | tail -n 1
}

require_command docker

image_tag="${IMAGE_TAG:?Set IMAGE_TAG to the frontend image to verify}"
container_name="frontend-verify-${RANDOM}-$$"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${image_tag}")"
[[ "${platform}" == "linux/amd64" ]] || {
  echo "FAIL: expected linux/amd64, found ${platform}" >&2
  exit 1
}

runtime_user="$(docker image inspect --format '{{.Config.User}}' "${image_tag}")"
[[ "${runtime_user}" == "101:101" ]] || {
  echo "FAIL: expected runtime user 101:101, found ${runtime_user:-root}" >&2
  exit 1
}

exposed_ports="$(docker image inspect --format '{{json .Config.ExposedPorts}}' "${image_tag}")"
[[ "${exposed_ports}" == '{"8080/tcp":{}}' ]] || {
  echo "FAIL: expected only port 8080, found ${exposed_ports}" >&2
  exit 1
}

for label in org.opencontainers.image.source org.opencontainers.image.revision org.opencontainers.image.version; do
  value="$(docker image inspect --format "{{index .Config.Labels \"${label}\"}}" "${image_tag}")"
  [[ -n "${value}" && "${value}" != '<no value>' ]] || {
    echo "FAIL: missing OCI label ${label}" >&2
    exit 1
  }
done

healthcheck="$(docker image inspect --format '{{json .Config.Healthcheck.Test}}' "${image_tag}")"
[[ "${healthcheck}" == *'/healthz'* ]] || {
  echo "FAIL: frontend image healthcheck is missing" >&2
  exit 1
}

docker run --detach \
  --platform linux/amd64 \
  --name "${container_name}" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,uid=101,gid=101 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  "${image_tag}" >/dev/null

ready=false
for _ in {1..30}; do
  if docker exec "${container_name}" wget --quiet --tries=1 --spider \
    http://127.0.0.1:8080/healthz 2>/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
[[ "${ready}" == "true" ]] || {
  docker logs --tail 50 "${container_name}" >&2 || true
  echo "FAIL: frontend health endpoint did not become ready" >&2
  exit 1
}

docker exec "${container_name}" wget --quiet --output-document=- \
  http://127.0.0.1:8080/route/that/needs/spa | grep -q 'id="root"' || {
  echo "FAIL: SPA fallback did not return index.html" >&2
  exit 1
}

for backend_path in api uploads images; do
  status="$(http_status "http://127.0.0.1:8080/${backend_path}/probe" || true)"
  [[ "${status}" == "404" ]] || {
    echo "FAIL: /${backend_path} must return 404, found ${status:-no response}" >&2
    exit 1
  }
done

index_html="$(docker exec "${container_name}" wget --quiet --output-document=- \
  http://127.0.0.1:8080/index.html)"
hashed_assets=()
while IFS= read -r asset; do
  hashed_assets+=("${asset}")
done < <(
  printf '%s' "${index_html}" \
    | grep -oE '/dist/app\.[0-9a-f]{12}\.(js|css)' \
    | sort -u
)
[[ "${#hashed_assets[@]}" -eq 2 ]] || {
  echo "FAIL: index.html must reference exactly one hashed JS and CSS asset" >&2
  exit 1
}
for asset in "${hashed_assets[@]}"; do
  status="$(http_status "http://127.0.0.1:8080${asset}" || true)"
  [[ "${status}" == "200" ]] || {
    echo "FAIL: referenced asset ${asset} returned ${status:-no response}" >&2
    exit 1
  }
  docker exec "${container_name}" wget --server-response --spider \
    "http://127.0.0.1:8080${asset}" 2>&1 \
    | tr -d '\r' \
    | grep -Eiq '^[[:space:]]*Cache-Control: .*max-age=31536000.*immutable' || {
    echo "FAIL: immutable cache header is missing for ${asset}" >&2
    exit 1
  }
done

docker exec "${container_name}" wget --server-response --spider \
  http://127.0.0.1:8080/index.html 2>&1 \
  | tr -d '\r' \
  | grep -Eiq '^[[:space:]]*Cache-Control: .*no-store' || {
  echo "FAIL: index.html no-store header is missing" >&2
  exit 1
}

docker exec "${container_name}" wget --server-response --spider \
  http://127.0.0.1:8080/version.json 2>&1 \
  | tr -d '\r' \
  | grep -Eiq '^[[:space:]]*Cache-Control: .*no-store' || {
  echo "FAIL: version.json no-store header is missing" >&2
  exit 1
}

revision="$(docker image inspect \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "${image_tag}")"
manifest="$(docker exec "${container_name}" wget --quiet --output-document=- \
  http://127.0.0.1:8080/version.json)"
manifest_version="$(printf '%s' "${manifest}" \
  | sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')"
[[ "${manifest_version}" == "${revision}" ]] || {
  echo "FAIL: version.json ${manifest_version:-missing} does not match OCI revision ${revision}" >&2
  exit 1
}

for legacy_asset in /dist/app.js /dist/app.css; do
  status="$(http_status "http://127.0.0.1:8080${legacy_asset}" || true)"
  [[ "${status}" == "404" ]] || {
    echo "FAIL: legacy asset ${legacy_asset} must not exist, found ${status:-no response}" >&2
    exit 1
  }
done

docker exec "${container_name}" nginx -t >/dev/null
if docker exec "${container_name}" nginx -T 2>&1 | grep -q 'proxy_pass'; then
  echo "FAIL: static origin contains reverse proxy configuration" >&2
  exit 1
fi
if docker exec "${container_name}" sh -c 'command -v node >/dev/null'; then
  echo "FAIL: Node.js exists in the runtime image" >&2
  exit 1
fi
if docker exec "${container_name}" sh -ec 'find /usr/share/nginx/html -type f -name "*.map" -print -quit | grep -q .'; then
  echo "FAIL: source map exists in the runtime image" >&2
  exit 1
fi
if docker exec "${container_name}" sh -ec '
  for file in $(find /usr/share/nginx/html -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" \) -print); do
    grep -Eq -- "AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----" "$file" && exit 0
  done
  exit 1
'; then
  echo "FAIL: credential-shaped content exists in the runtime image" >&2
  exit 1
fi

echo "PASS: ${image_tag} is an amd64, non-root, read-only static origin on 8080."

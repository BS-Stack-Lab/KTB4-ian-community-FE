#!/usr/bin/env bash

set -Eeuo pipefail

root="${1:-build}"
[[ -d "${root}" ]] || {
  echo "Build directory not found: ${root}" >&2
  exit 1
}

if find "${root}" -type f -name '*.map' -print -quit | grep -q .; then
  echo "Source maps must not be included in the production build" >&2
  exit 1
fi

if rg --hidden --no-messages -n \
  'AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' \
  "${root}"; then
  echo "Credential-shaped content found in the production build" >&2
  exit 1
fi

index_file="${root}/index.html"
version_file="${root}/version.json"
[[ -f "${index_file}" && -f "${version_file}" ]] || {
  echo "Hashed build must include index.html and version.json" >&2
  exit 1
}

grep -Eq '/dist/app\.[0-9a-f]{12}\.js' "${index_file}" || {
  echo "Hashed JavaScript entry is missing from index.html" >&2
  exit 1
}
grep -Eq '/dist/app\.[0-9a-f]{12}\.css' "${index_file}" || {
  echo "Hashed CSS entry is missing from index.html" >&2
  exit 1
}
[[ ! -e "${root}/dist/app.js" && ! -e "${root}/dist/app.css" ]] || {
  echo "Legacy fixed-name assets must not be emitted" >&2
  exit 1
}

node --input-type=module - "${version_file}" "${APP_VERSION:-}" <<'NODE'
import fs from "node:fs";

const [, , manifestPath, expectedVersion] = process.argv;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1) throw new Error("Invalid manifest schemaVersion");
if (typeof manifest.version !== "string" || manifest.version.length === 0)
  throw new Error("Missing manifest version");
if (expectedVersion && manifest.version !== expectedVersion)
  throw new Error("Manifest version does not match APP_VERSION");
if ("builtAt" in manifest || "buildTime" in manifest || "timestamp" in manifest)
  throw new Error("Reproducible manifest must not contain a build timestamp");
for (const type of ["js", "css"]) {
  if (!Array.isArray(manifest.assets?.[type]) || manifest.assets[type].length !== 1)
    throw new Error(`Manifest must contain exactly one ${type} entry`);
  const suffix = type === "js" ? "js" : "css";
  if (!new RegExp(`^/dist/app\\.[0-9a-f]{12}\\.${suffix}$`).test(manifest.assets[type][0]))
    throw new Error(`Invalid ${type} contenthash entry`);
}
NODE

echo "PASS: production build, version manifest, and contenthash policy passed."

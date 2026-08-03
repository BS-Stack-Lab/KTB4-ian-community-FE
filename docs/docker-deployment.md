# Frontend container build and verification

The production image builds the Webpack React SPA in a Node builder stage and
copies only `index.html`, `dist`, and the Nginx configuration into the runtime
stage. Nginx runs as its packaged non-root user, serves SPA routes, and proxies
`/api/` and `/uploads/` to the Compose service named `backend`.

## Prerequisites

- Docker Engine with Buildx
- A builder that lists `linux/amd64` in `docker buildx ls`
- Git

## Build an EC2 image

```bash
IMAGE_TAG=community-frontend:<frontend-commit> \
  ./scripts/build-image.sh
```

Apple Silicon hosts must keep the default `PLATFORM=linux/amd64`. To create a
transfer archive and checksum without using a registry:

```bash
IMAGE_TAG=community-frontend:<frontend-commit> \
EXPORT_TAR=1 \
  ./scripts/build-image.sh
```

The archive is written under the ignored `artifacts/` directory. Do not add the
archive to Git.

## Verify the runtime image

```bash
IMAGE_TAG=community-frontend:<frontend-commit> \
  ./scripts/verify-image.sh
```

The verification checks the image architecture and runtime user, validates the
Nginx configuration, exercises SPA fallback and `/api` proxying, checks static
cache headers, and confirms Node.js is absent from the runtime image.

## Public configuration and secrets

The production browser uses same-origin requests, so no API build argument is
required. Values bundled into browser JavaScript are public. Never pass JWT,
database, AWS, or other server credentials as Docker build arguments or frontend
environment variables.

Before release, inspect the bundle for unexpected values:

```bash
rg -n 'AKIA|BEGIN .*PRIVATE KEY|DB_PASSWORD|JWT_SECRET' dist
find dist -type f -name '*.map' -print
```

Both commands should produce no output.

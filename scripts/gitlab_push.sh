#!/bin/bash

set -euo pipefail

# Ensure XDG_RUNTIME_DIR matches the current user's UID.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

REGISTRY="registry.gitlab.com/rseward1/myuno"

# Extract the version from package.json
VERSION=$(node -p "require('./package.json').version")

echo "Pushing myuno v${VERSION} to ${REGISTRY}"

# Tag and push the versioned tag (e.g. registry.gitlab.com/rseward1/myuno:0.1.0)
podman tag myuno:latest "${REGISTRY}:${VERSION}"
podman push             "${REGISTRY}:${VERSION}"

# Tag and push :latest so the newest release is always reachable
podman tag myuno:latest "${REGISTRY}:latest"
podman push             "${REGISTRY}:latest"

echo "Done. Pushed tags: ${VERSION}, latest"
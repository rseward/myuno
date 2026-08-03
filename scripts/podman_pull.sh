#!/bin/bash

set -euo pipefail

# Ensure XDG_RUNTIME_DIR matches the current user's UID.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

REGISTRY="registry.gitlab.com/rseward1/myuno"

# Extract the version from package.json
VERSION=$(node -p "require('./package.json').version")

echo "Pulling myuno v${VERSION} from ${REGISTRY}"
podman pull "${REGISTRY}:${VERSION}"
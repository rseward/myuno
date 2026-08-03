#!/usr/bin/env bash
set -euo pipefail

# Ensure XDG_RUNTIME_DIR points to the current user's runtime directory.
# If it's misconfigured (e.g. inherited from another user), podman fails with
# "mkdir /run/user/<uid>/libpod: permission denied".
CORRECT_XDG="/run/user/$(id -u)"
if [ -d "$CORRECT_XDG" ] && [ "$XDG_RUNTIME_DIR" != "$CORRECT_XDG" ]; then
  export XDG_RUNTIME_DIR="$CORRECT_XDG"
fi

IMAGE_NAME="myuno"
CONTAINER_NAME="myuno"

# Build the image from the project root
podman build -t "$IMAGE_NAME" .

# Remove any existing container with the same name
podman rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Run the container, exposing the boardgame.io server (8001) and debug endpoint (8002)
podman run -d --name "$CONTAINER_NAME" -p 8001:8001 -p 8002:8002 "$IMAGE_NAME"
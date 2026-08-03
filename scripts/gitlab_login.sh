#!/bin/bash
set -euo pipefail

# Ensure XDG_RUNTIME_DIR matches the current user's UID.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

podman login registry.gitlab.com -u rseward1 -p "$GITLAB_DEPLOY_TOKEN"

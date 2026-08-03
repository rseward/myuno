#!/bin/bash

set -euo pipefail

# Ensure XDG_RUNTIME_DIR matches the current user's UID.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

podman tag myuno:latest registry.gitlab.com/rseward1/myuno:latest

podman push registry.gitlab.com/rseward1/myuno:latest

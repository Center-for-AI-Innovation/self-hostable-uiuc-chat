#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.yaml -f infra/docker/docker-compose.sim.yaml)
REMOVE_VOLUMES=false

show_usage() {
	echo "Usage: $0 [--volumes]"
	echo ""
	echo "Options:"
	echo "  --volumes   Also remove full-stack containers, volumes, and local data"
	echo "  --help      Show this help message"
}

for arg in "$@"; do
	case "$arg" in
	--volumes | -v) REMOVE_VOLUMES=true ;;
	--help | -h)
		show_usage
		exit 0
		;;
	*)
		show_usage
		exit 1
		;;
	esac
done

if [ "$REMOVE_VOLUMES" = true ]; then
	echo "[INFO] Stopping full Docker stack and removing volumes..."
	"${COMPOSE[@]}" down -v --remove-orphans
else
	echo "[INFO] Stopping full Docker stack..."
	"${COMPOSE[@]}" down --remove-orphans
fi

echo "[SUCCESS] Full Docker stack stopped."

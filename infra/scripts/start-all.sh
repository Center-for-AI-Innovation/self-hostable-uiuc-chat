#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.yaml -f infra/docker/docker-compose.sim.yaml)
QDRANT_COLLECTION_NAME="${QDRANT_COLLECTION_NAME:-illinois_chat}"
QDRANT_VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-4096}"

wipe_data=false
rebuild_services=""

show_usage() {
	echo "Usage: $0 [--wipe_data] [--rebuild=service1,service2]"
	echo ""
	echo "Options:"
	echo "  --wipe_data          Factory reset Docker containers and volumes before startup"
	echo "  --rebuild=SERVICES   Rebuild only selected full-stack services"
	echo "  --help               Show this help message"
}

for arg in "$@"; do
	case "$arg" in
	--wipe_data) wipe_data=true ;;
	--rebuild=*) rebuild_services="${arg#*=}" ;;
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

log() {
	echo "[INFO] $1"
}

success() {
	echo "[SUCCESS] $1"
}

warn() {
	echo "[WARNING] $1"
}

if [ ! -f .env ]; then
	log "Creating .env from .env.template"
	cp .env.template .env
fi

set -a
. ./.env
set +a

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DATABASE="${POSTGRES_DATABASE:-postgres}"
QDRANT_COLLECTION_NAME="${QDRANT_COLLECTION_NAME:-illinois_chat}"
QDRANT_VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-4096}"

if [ "$wipe_data" = true ]; then
	warn "Factory resetting full Docker stack volumes"
	"${COMPOSE[@]}" down -v --remove-orphans
fi

log "Pulling Sim AI images"
"${COMPOSE[@]}" pull simstudio sim-realtime sim-migrations

if [ -n "$rebuild_services" ]; then
	rebuild_list="$(echo "$rebuild_services" | tr ',' ' ')"
	log "Rebuilding selected services: $rebuild_list"
	"${COMPOSE[@]}" up -d --build $rebuild_list
	"${COMPOSE[@]}" up -d
else
	log "Starting full Docker stack"
	"${COMPOSE[@]}" up -d --build
fi

wait_for_healthy() {
	local service="$1"
	local timeout="${2:-180}"
	local elapsed=0

	log "Waiting for $service to become healthy"
	until "${COMPOSE[@]}" ps "$service" | grep -q "healthy"; do
		if [ "$elapsed" -ge "$timeout" ]; then
			"${COMPOSE[@]}" logs "$service"
			echo "[ERROR] $service did not become healthy within ${timeout}s"
			exit 1
		fi
		sleep 3
		elapsed=$((elapsed + 3))
	done
	success "$service is healthy"
}

wait_for_completed() {
	local service="$1"
	local timeout="${2:-240}"
	local elapsed=0

	log "Waiting for $service to complete"
	while true; do
		local container_id state exit_code
		container_id="$("${COMPOSE[@]}" ps -aq "$service")"
		if [ -n "$container_id" ]; then
			state="$(docker inspect -f '{{.State.Status}}' "$container_id")"
			exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$container_id")"
			if [ "$state" = "exited" ] && [ "$exit_code" = "0" ]; then
				success "$service completed"
				return
			fi
			if [ "$state" = "exited" ]; then
				"${COMPOSE[@]}" logs "$service"
				echo "[ERROR] $service exited with code $exit_code"
				exit 1
			fi
		fi

		if [ "$elapsed" -ge "$timeout" ]; then
			"${COMPOSE[@]}" logs "$service"
			echo "[ERROR] $service did not complete within ${timeout}s"
			exit 1
		fi
		sleep 3
		elapsed=$((elapsed + 3))
	done
}

wait_for_healthy postgres-illinois-chat
wait_for_healthy postgres-keycloak
wait_for_healthy qdrant
wait_for_healthy minio
wait_for_healthy rabbitmq
wait_for_healthy keycloak 240
wait_for_healthy sim-db
wait_for_completed sim-migrations 300
wait_for_completed sim-keycloak-setup 180
wait_for_completed sim-sso-setup 180
wait_for_healthy sim-realtime
wait_for_healthy simstudio 300

psql_main() {
	"${COMPOSE[@]}" exec -T postgres-illinois-chat psql -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" "$@"
}

table_exists() {
	local table_name="$1"
	psql_main -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table_name}')" | tr -d '[:space:]'
}

log "Initializing PostgreSQL schema"
if [ "$(table_exists documents)" = "t" ]; then
	success "PostgreSQL schema already exists"
elif [ -f infra/db/migrations/20250328_remote_schema.sql ]; then
	warn "Applying Supabase schema dump; some Supabase-specific errors may be non-critical"
	psql_main -f - <infra/db/migrations/20250328_remote_schema.sql || warn "Schema migration completed with warnings"
else
	warn "infra/db/migrations/20250328_remote_schema.sql not found; skipping schema import"
fi

for table_name in documents conversations messages; do
	if [ "$(table_exists "$table_name")" != "t" ]; then
		echo "[ERROR] Expected table '$table_name' is missing"
		exit 1
	fi
done
success "PostgreSQL schema verified"

qdrant_headers=(-H "Content-Type: application/json")
if [ -n "${QDRANT_API_KEY-}" ]; then
	qdrant_headers+=(-H "api-key: ${QDRANT_API_KEY}")
fi

log "Ensuring Qdrant collection '$QDRANT_COLLECTION_NAME' has vector size $QDRANT_VECTOR_SIZE"
qdrant_details="$(curl -sS --max-time 10 "http://localhost:6333/collections/${QDRANT_COLLECTION_NAME}" "${qdrant_headers[@]}" || true)"
if echo "$qdrant_details" | grep -q '"status":"ok"'; then
	if echo "$qdrant_details" | grep -q "\"size\"[[:space:]]*:[[:space:]]*${QDRANT_VECTOR_SIZE}" && echo "$qdrant_details" | grep -q '"distance"[[:space:]]*:[[:space:]]*"Cosine"'; then
		success "Qdrant collection already has the expected schema"
	else
		warn "Qdrant collection schema mismatch; recreating '$QDRANT_COLLECTION_NAME'"
		curl -sS --max-time 10 -X DELETE "http://localhost:6333/collections/${QDRANT_COLLECTION_NAME}" "${qdrant_headers[@]}" >/dev/null
		qdrant_details=""
	fi
fi

if ! echo "$qdrant_details" | grep -q '"status":"ok"'; then
	curl -sS --max-time 10 -X PUT "http://localhost:6333/collections/${QDRANT_COLLECTION_NAME}" \
		"${qdrant_headers[@]}" \
		-d "{\"vectors\":{\"size\":${QDRANT_VECTOR_SIZE},\"distance\":\"Cosine\"}}" >/dev/null
	success "Qdrant collection created"
fi

success "Full Docker stack is ready"
echo ""
echo "Available endpoints:"
echo "  Frontend: http://localhost:3000"
echo "  Keycloak: http://localhost:8080"
echo "  MinIO API: http://localhost:9000"
echo "  MinIO Console: http://localhost:9001"
echo "  Qdrant: http://localhost:6333/dashboard"
echo "  PostgreSQL: localhost:5432"
echo "  Sim AI: http://localhost:${SIM_APP_PORT:-3010}"
echo "  Sim realtime: http://localhost:${SIM_REALTIME_PORT:-3011}/health"
echo "  Sim pgvector: localhost:${SIM_POSTGRES_PORT:-55432}"

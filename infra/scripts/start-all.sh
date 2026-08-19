#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# The Sim stack is appended after argument parsing unless --no-sim is given.
COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.yaml)
QDRANT_COLLECTION_NAME="${QDRANT_COLLECTION_NAME:-illinois_chat}"
QDRANT_VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-4096}"

wipe_data=false
create_schema=false
with_sim=true
rebuild_services=""

show_usage() {
	echo "Usage: $0 [--wipe_data] [--create-schema] [--rebuild=service1,service2] [--no-sim]"
	echo ""
	echo "Options:"
	echo "  --wipe_data          Factory reset Docker containers and volumes before startup"
	echo "                       (recreates the database schema as part of the reset)"
	echo "  --create-schema      Create the database schema on an empty database"
	echo "                       (required on first run; reruns never need it)"
	echo "  --rebuild=SERVICES   Rebuild only selected full-stack services"
	echo "  --no-sim             Start without the Sim AI tool stack (six fewer"
	echo "                       services; Sim containers from a previous run are"
	echo "                       left untouched)"
	echo "  --help               Show this help message"
}

for arg in "$@"; do
	case "$arg" in
	--wipe_data) wipe_data=true ;;
	--create-schema) create_schema=true ;;
	--no-sim) with_sim=false ;;
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

if [ "$wipe_data" = true ] && [ "$create_schema" = true ]; then
	echo "[ERROR] --wipe_data and --create-schema cannot be used together (--wipe_data already recreates the schema on the fresh database)."
	exit 1
fi

if [ "$with_sim" = true ]; then
	COMPOSE+=(-f infra/docker/docker-compose.sim.yaml)
fi

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

# Sim's four secrets have no defaults in docker-compose.sim.yaml — a working
# default would be a published key, and API_ENCRYPTION_KEY is what encrypts
# stored Sim API keys. Generate per-deployment values on first run and persist
# them, the same way ENCRYPTION_MASTER_KEY is handled.
ensure_sim_secrets() {
	local name value
	for name in SIM_API_ENCRYPTION_KEY SIM_BETTER_AUTH_SECRET SIM_ENCRYPTION_KEY SIM_INTERNAL_API_SECRET; do
		eval "value=\${$name:-}"
		if [ -n "$value" ]; then
			continue
		fi
		if [ "$name" = "SIM_API_ENCRYPTION_KEY" ]; then
			# Sim validates this one as exactly 64 hex characters.
			value="$(openssl rand -hex 32)"
		else
			value="$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-40)"
		fi
		export "$name=$value"
		if grep -q "^${name}=" .env; then
			sed -i.bak "s|^${name}=.*|${name}=\"${value}\"|" .env
			rm -f .env.bak
		else
			printf '%s="%s"\n' "$name" "$value" >>.env
		fi
		echo "[INFO] Generated ${name} into .env"
		case "$name" in
		SIM_ENCRYPTION_KEY | SIM_API_ENCRYPTION_KEY)
			echo "[WARNING] ${name} was not set, so a new one was generated. Anything Sim already encrypted under a previous value cannot be decrypted with it — re-enter secrets stored inside Sim workflows if this stack has existing data."
			;;
		SIM_BETTER_AUTH_SECRET)
			echo "[WARNING] SIM_BETTER_AUTH_SECRET was not set, so a new one was generated. Existing Sim sessions are invalidated; sign in again."
			;;
		esac
	done
}

if [ "$with_sim" = true ]; then
	ensure_sim_secrets
	if [ -z "${SIM_APPROVAL_ADMIN_EMAIL:-}" ]; then
		echo "[ERROR] SIM_APPROVAL_ADMIN_EMAIL is not set in .env. It names the account that bootstraps as Sim platform admin, so it must be chosen per deployment. Set it (or pass --no-sim)."
		exit 1
	fi

	log "Pulling Sim AI images"
	"${COMPOSE[@]}" pull simstudio sim-realtime sim-migrations
fi

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
if [ "$with_sim" = true ]; then
	wait_for_healthy sim-db
	wait_for_completed sim-migrations 300
	wait_for_completed sim-approval-setup 120
	wait_for_completed sim-keycloak-setup 180
	wait_for_completed sim-sso-setup 180
	wait_for_healthy sim-realtime
	wait_for_healthy simstudio 300
fi

psql_main() {
	"${COMPOSE[@]}" exec -T postgres-illinois-chat psql -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" "$@"
}

table_exists() {
	local table_name="$1"
	psql_main -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table_name}')" | tr -d '[:space:]'
}

log "Initializing PostgreSQL schema"
# init-schema.sql is derived from the frontend Drizzle schema and is only
# safe on a fresh database — gate on the `documents` table before applying.
if [ "$(table_exists documents)" = "t" ]; then
	if [ "$(table_exists project_external_connections)" != "t" ]; then
		echo "[ERROR] Existing database predates the external-connections schema."
		echo "[ERROR] Re-run with --wipe_data to recreate it from infra/db/init-schema.sql."
		exit 1
	fi
	success "PostgreSQL schema already exists"
elif [ "$wipe_data" = true ] || [ "$create_schema" = true ]; then
	if [ ! -f infra/db/init-schema.sql ]; then
		echo "[ERROR] infra/db/init-schema.sql not found; cannot initialize the database"
		exit 1
	fi
	log "Applying clean schema from infra/db/init-schema.sql"
	psql_main -v ON_ERROR_STOP=1 -f - <infra/db/init-schema.sql >/dev/null
	success "Database schema created successfully"
else
	echo "[ERROR] Database is empty. Re-run with --create-schema to create the schema from infra/db/init-schema.sql."
	exit 1
fi

for table_name in documents conversations messages embeddings project_external_connections project_connection_audit_log; do
	if [ "$(table_exists "$table_name")" != "t" ]; then
		echo "[ERROR] Expected table '$table_name' is missing"
		exit 1
	fi
done
# The sim columns are part of the app schema whether or not the Sim stack
# runs (the frontend's typed selects reference them). Fresh databases get
# them from init-schema.sql; databases created before the migration get them
# here, from the migration itself — the one place the DDL lives.
log "Ensuring Sim AI project config columns exist"
psql_main -v ON_ERROR_STOP=1 -f - <apps/frontend/src/db/migrations/0006_add_sim_columns.sql >/dev/null
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

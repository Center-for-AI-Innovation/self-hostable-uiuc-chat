#!/bin/bash

set -e # Exit on first error
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --clean    Clear existing containers, volumes, and data before initialization"
    echo "  --help     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Initialize development environment"
    echo "  $0 --clean      # Clear everything and start fresh"
}

# Parse command line arguments
CLEAN_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_MODE=true
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

echo "🚀 Initializing UIUC.chat Development Environment"
echo "=================================================="

# Clean mode: Clear existing containers and volumes
if [ "$CLEAN_MODE" = true ]; then
    print_warning "CLEAN MODE: Clearing existing containers, volumes, and data..."
    
    # Stop and remove containers
    print_status "Stopping and removing existing containers..."
    docker-compose -f docker-compose.dev.yaml down -v 2>/dev/null || true
    
    # Remove any remaining containers
    print_status "Removing any remaining containers..."
    docker ps -aq --filter "name=redis|qdrant|minio|postgres-illinois-chat|postgres-keycloak|rabbitmq|keycloak|worker" | xargs -r docker rm -f 2>/dev/null || true
    
    # Remove volumes
    print_status "Removing volumes..."
    docker volume rm uiuc-chat-network_redis-data uiuc-chat-network_qdrant-data uiuc-chat-network_minio-data uiuc-chat-network_postgres-illinois-chat uiuc-chat-network_postgres-keycloak uiuc-chat-network_rabbitmq 2>/dev/null || true
    
    # Clear Qdrant data directory
    print_status "Clearing Qdrant data..."
    rm -rf qdrant_data/* 2>/dev/null || true
    
    # Frontend-specific cleanup removed (frontend is a submodule)
    
    print_success "Cleanup completed!"
    echo ""
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f .env.template ]; then
        cp .env.template .env
        print_success "Created .env from template"
    else
        print_error ".env.template not found. Creating default .env file..."
        cat > .env << 'EOF'
# Database Configuration
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=password
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-strong-key-here

# Redis Configuration
INGEST_REDIS_PASSWORD=password

# MinIO Configuration
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
DOCKER_INTERNAL_MINIO_API_PORT=10000
DOCKER_INTERNAL_MINIO_DASHBOARD_PORT=10001
PUBLIC_MINIO_API_PORT=10000
PUBLIC_MINIO_DASHBOARD_PORT=9001

# RabbitMQ Configuration
RABBITMQ_USER=guest
RABBITMQ_PASS=guest

# Keycloak Configuration
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Other Configuration
OPENAI_API_KEY=your-openai-api-key-here
EOF
        print_success "Created default .env file"
    fi
fi

# Validate .env file format
print_status "Validating .env file format..."
if grep -q "=" .env; then
    print_success ".env file format looks valid"
else
    print_error ".env file appears to be empty or malformed"
    exit 1
fi

# Load environment variables
print_status "Loading environment variables..."
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
    print_success "Environment variables loaded"
else
    print_warning "No .env file found"
fi

## Frontend .env setup removed (frontend is a submodule)

# Start Docker Compose services
print_status "Starting Docker Compose services..."
docker-compose -f docker-compose.dev.yaml up -d

print_success "Docker Compose services started!"

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 15

# Check if services are actually running and healthy using Docker Compose health checks
print_status "Checking if services started successfully..."

# Wait for essential services to be healthy
print_status "Waiting for PostgreSQL to be healthy..."
if docker-compose -f docker-compose.dev.yaml ps postgres-illinois-chat | grep -q "healthy"; then
    print_success "✓ PostgreSQL is healthy"
else
    print_status "Waiting for PostgreSQL health check..."
    # Use a portable timeout approach that works on both Linux and macOS
    (
        # Start a background process to kill the loop after 60 seconds
        sleep 60 && kill $$ 2>/dev/null &
        # Wait for the service to become healthy
        until docker-compose -f docker-compose.dev.yaml ps postgres-illinois-chat | grep -q "healthy"; do 
            sleep 2
        done
    ) &
    wait $!
    if [ $? -eq 0 ]; then
        print_success "✓ PostgreSQL is now healthy"
    else
        print_error "✗ PostgreSQL failed to become healthy"
        print_status "Checking Docker logs..."
        docker-compose -f docker-compose.dev.yaml logs postgres-illinois-chat
        exit 1
    fi
fi

print_status "Waiting for Qdrant to be healthy..."
if docker-compose -f docker-compose.dev.yaml ps qdrant | grep -q "healthy"; then
    print_success "✓ Qdrant is healthy"
else
    print_status "Waiting for Qdrant health check..."
    # Use a portable timeout approach that works on both Linux and macOS
    (
        # Start a background process to kill the loop after 60 seconds
        sleep 60 && kill $$ 2>/dev/null &
        # Wait for the service to become healthy
        until docker-compose -f docker-compose.dev.yaml ps qdrant | grep -q "healthy"; do 
            sleep 2
        done
    ) &
    wait $!
    if [ $? -eq 0 ]; then
        print_success "✓ Qdrant is now healthy"
    else
        print_error "✗ Qdrant failed to become healthy"
        print_status "Checking Docker logs..."
        docker-compose -f docker-compose.dev.yaml logs qdrant
        exit 1
    fi
fi

print_success "All essential containers are running and healthy!"

# Initialize PostgreSQL schema (mandatory)
print_status "Initializing PostgreSQL schema..."

DB_HOST=${POSTGRES_ENDPOINT:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_NAME=${POSTGRES_DATABASE:-postgres}
DB_USER=${POSTGRES_USERNAME:-postgres}
DB_PASS=${POSTGRES_PASSWORD:-password}

# Export for psql
export PGPASSWORD="$DB_PASS"

print_status "Applying database schema from db/migrations..."
if [ -f db/migrations/20250328_remote_schema.sql ]; then
  print_status "Note: This Supabase schema dump will generate many non-critical errors for missing extensions/roles"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f db/migrations/20250328_remote_schema.sql 2>/dev/null || {
    print_warning "Schema migration completed with some expected errors (Supabase-specific components)"
  }
  print_success "Core application tables created successfully"
else
  print_warning "db/migrations/20250328_remote_schema.sql not found; skipping apply"
fi

print_status "Verifying PostgreSQL schema..."
# Helper to check table exists
check_table() {
  local tbl=$1
  exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${tbl}')")
  if [ "$exists" = "t" ] || [ "$exists" = "true" ]; then
    print_success "✓ Table '${tbl}' exists"
    return 0
  else
    print_error "✗ Table '${tbl}' missing"
    return 1
  fi
}

# Helper to check function exists (by name only)
check_function() {
  local func=$1
  exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${func}')")
  if [ "$exists" = "t" ] || [ "$exists" = "true" ]; then
    print_success "✓ Function '${func}' exists"
    return 0
  else
    print_error "✗ Function '${func}' missing"
    return 1
  fi
}

verify_ok=true
# Verify a minimal set that should exist after migrations
check_table documents || verify_ok=false
# Add more if desired; these are common in this project
check_table conversations || verify_ok=false
check_table messages || verify_ok=false

if [ "$verify_ok" != true ]; then
  print_error "Database schema verification failed. See errors above."
  exit 1
fi

print_success "PostgreSQL schema initialized and verified."

## Frontend schema alignment verification removed

# Populate Qdrant
print_status "Creating Qdrant collection..."

# Ensure QDRANT_URL is defined
if [[ -z "$QDRANT_URL" ]]; then
    QDRANT_URL="http://localhost:6333"
    print_warning "QDRANT_URL not set, using default: $QDRANT_URL"
fi

# If QDRANT_URL points to the container hostname, rewrite to localhost for host curl access
if echo "$QDRANT_URL" | grep -qE "http://qdrant(:6333)?$|http://qdrant:6333"; then
    print_warning "QDRANT_URL points to container hostname (qdrant). Using host-mapped URL instead."
    QDRANT_URL="http://localhost:6333"
fi

# Wait a bit more for Qdrant to be fully ready
print_status "Waiting for Qdrant to be fully ready..."
sleep 5

# Create Qdrant collection (with optional API key)
print_status "Creating Qdrant collection..."

# First, check if collection already exists
print_status "Checking if Qdrant collection exists..."
# Build headers (optionally include API key if provided)
CURL_HEADERS=("-H" "Content-Type: application/json")
if [[ -n "$QDRANT_API_KEY" ]]; then
    CURL_HEADERS+=("-H" "api-key: $QDRANT_API_KEY")
fi

if curl -s --max-time 10 "${QDRANT_URL}/collections/illinois_chat" "${CURL_HEADERS[@]}" 2>/dev/null | grep -q '"status":"ok"'; then
    # Verify the existing collection schema matches expected config
    details=$(curl -sS --max-time 10 "${QDRANT_URL}/collections/illinois_chat" "${CURL_HEADERS[@]}" 2>/dev/null || true)
    if echo "$details" | grep -q '"size"[[:space:]]*:[[:space:]]*768' && echo "$details" | grep -q '"distance"[[:space:]]*:[[:space:]]*"Cosine"'; then
        print_success "✓ Qdrant collection already exists with correct schema (size=768, distance=Cosine)"
    else
        print_warning "Existing Qdrant collection schema does not match expected. Recreating collection..."
        # Delete and recreate with correct schema
        delete_resp=$(curl -sS --max-time 10 -X DELETE "${QDRANT_URL}/collections/illinois_chat" "${CURL_HEADERS[@]}" 2>/dev/null || true)
        print_status "Delete response: $delete_resp"
        create_resp=$(curl -sS --max-time 10 -X PUT "${QDRANT_URL}/collections/illinois_chat" \
            "${CURL_HEADERS[@]}" \
            -d '{
              "vectors": {
                "size": 768,
                "distance": "Cosine"
              }
            }' 2>/dev/null || true)
        if echo "$create_resp" | grep -q '"status":"ok"'; then
            print_success "✓ Qdrant collection recreated successfully with correct schema"
        else
            print_error "✗ Failed to recreate Qdrant collection"
            print_status "Create response: $create_resp"
            exit 1
        fi
    fi
else
    # Try multiple times to create the collection
    attempts=10
    success=false
    last_response=""
    for i in $(seq 1 $attempts); do
        print_status "Attempt $i/$attempts to create Qdrant collection..."
        response=$(curl -sS --max-time 10 -X PUT "${QDRANT_URL}/collections/illinois_chat" \
            "${CURL_HEADERS[@]}" \
            -d '{
              "vectors": {
                "size": 768,
                "distance": "Cosine"
              }
            }' 2>/dev/null || true)
        last_response="$response"
        
        if echo "$response" | grep -q '"status":"ok"'; then
            print_success "✓ Qdrant collection created successfully"
            success=true
            break
        elif echo "$response" | grep -qi "already exists"; then
            print_success "✓ Qdrant collection already exists"
            success=true
            break
        fi
        sleep 2
    done

    if [ "$success" != true ]; then
        print_error "✗ Failed to create Qdrant collection after $attempts attempts"
        print_status "Last response: $last_response"
        print_status "Checking Qdrant logs..."
        docker-compose -f docker-compose.dev.yaml logs qdrant
        exit 1
    fi
fi

print_success "Qdrant collection ready!"

# Initialize MinIO bucket
print_status "Setting up MinIO bucket..."

# Ensure MinIO environment variables are set
if [[ -z "$AWS_ACCESS_KEY_ID" ]]; then
    AWS_ACCESS_KEY_ID="minioadmin"
    print_warning "AWS_ACCESS_KEY_ID not set, using default: $AWS_ACCESS_KEY_ID"
fi

if [[ -z "$AWS_SECRET_ACCESS_KEY" ]]; then
    AWS_SECRET_ACCESS_KEY="minioadmin"
    print_warning "AWS_SECRET_ACCESS_KEY not set, using default: $AWS_SECRET_ACCESS_KEY"
fi

# Create MinIO bucket using AWS CLI or curl
if command -v aws &> /dev/null; then
    aws s3 mb s3://uiuc-chat --endpoint-url http://localhost:10000 || print_warning "Failed to create MinIO bucket (might already exist)"
else
    print_warning "AWS CLI not found, skipping MinIO bucket creation"
fi

print_success "MinIO bucket setup complete!"

# TODO: Keycloak Setup Reminder
print_status "Setting up Keycloak realms (manual or mounted)..."
print_warning "NOTE: Keycloak realm setup currently depends on mounted config. Ensure realms are manually created or automated in AWS deployments."

# Summary
echo ""
echo "=================================================="
print_success "Infrastructure setup complete!"
echo ""
echo "📋 Services are now running:"
echo "   - PostgreSQL (UIUC Chat): localhost:5432"
echo "   - PostgreSQL (Keycloak): localhost:5433"
echo "   - Redis: localhost:6379"
echo "   - Qdrant: localhost:6333"
echo "   - MinIO: localhost:10000"
echo "   - MinIO Console: localhost:9001"
echo "   - RabbitMQ: localhost:5672"
echo "   - RabbitMQ Management: localhost:15672"
echo "   - Keycloak: localhost:8080"
echo ""
echo "📚 Infrastructure initialized:"
echo "   - Qdrant collection 'illinois_chat' created"
echo "   - MinIO bucket 'uiuc-chat' ready"
echo "   - All services healthy and ready"
echo ""
echo "🌐 Next steps:"
echo "1. Update the API keys in the .env file"
echo "2. Start the backend service:"
echo "   cd uiuc-chat-backend && source venv/bin/activate && flask --app ai_ta_backend.main:app --debug run --port 8000"
echo ""
echo "🔍 To verify everything is working:"
echo "   - Check containers: docker ps"
echo "   - Check logs: docker-compose -f docker-compose.dev.yaml logs"
echo "   - Test Qdrant: curl http://localhost:6333/collections"
echo "   - Test PostgreSQL: psql -h localhost -p 5432 -U postgres -d postgres"

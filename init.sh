#!/bin/bash

# USAGE: sudo sh init.sh [options]
# Options:
#   --wipe_data        a fresh start: factory-reset, delete all databases and docker volumes
#   --rebuild=CONTAINERS  Only rebuild specific containers (comma-separated list)

# Parse command line arguments
wipe_data=false
rebuild_containers=""
for arg in "$@"; do
  case $arg in
    --wipe_data) wipe_data=true ;;
    --rebuild=*) rebuild_containers="${arg#*=}" ;;
    *) echo "Usage: $0 [--wipe_data] [--rebuild=container1,container2]" && exit 1 ;;
  esac
done

# Set build variables based on option
if [ -n "$rebuild_containers" ]; then
  # Convert comma-separated list to space-separated for docker compose
  rebuild_list=$(echo $rebuild_containers | tr ',' ' ')
  build_command="up -d"
else
  build_command="up -d --build"
fi

# ✅ Load .env vars into shell so they can be used as build args
export $(grep -v '^#' .env | xargs)

if [ ! -f .env ]; then
  # each docker-compose service will read from .env
  cp .env.template .env
fi

set -e

# Start the main Docker Compose services
echo "Starting application services..."
if [ "$wipe_data" = true ]; then
  docker compose -f ./docker-compose.dev.yaml down -v
fi

# If specific containers are specified for rebuild in the main stack
if [ -n "$rebuild_containers" ]; then
  # Check if any of the specified containers are in the main stack
  for container in $(echo $rebuild_list); do
    if docker compose -f ./docker-compose.dev.yaml ps -a --services | grep -q $container; then
      echo "Rebuilding container: $container"
      sudo docker compose -f ./docker-compose.dev.yaml up -d --build $container
    fi
  done
  
  # Start any remaining services without building
  sudo docker compose -f ./docker-compose.dev.yaml up -d
else
  # Start all services
  sudo docker compose -f ./docker-compose.dev.yaml up -d --build
fi

# Wait for PostgreSQL databases to be ready
echo "Waiting for PostgreSQL databases to be ready..."

# Wait for main application PostgreSQL
echo "Waiting for main PostgreSQL database..."
until docker exec postgres-illinois-chat pg_isready -U postgres; do
  echo "Main database not yet ready - waiting..."
  sleep 2
done

until docker exec postgres-illinois-chat psql -U postgres -c "SELECT 1" >/dev/null 2>&1; do
  echo "Testing main database connection - waiting..."
  sleep 2
done

# Wait for Keycloak PostgreSQL (if using separate instance)
if docker ps | grep -q postgres-keycloak; then
  echo "Waiting for Keycloak PostgreSQL database..."
  until docker exec postgres-keycloak pg_isready -U postgres; do
    echo "Keycloak database not yet ready - waiting..."
    sleep 2
  done

  until docker exec postgres-keycloak psql -U postgres -c "SELECT 1" >/dev/null 2>&1; do
    echo "Testing Keycloak database connection - waiting..."
    sleep 2
  done
fi

# Check if schema is already initialized by looking for the users table
echo "Checking if database schema is already initialized..."
SCHEMA_EXISTS=$(docker exec postgres-illinois-chat psql -U postgres -d postgres -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users');" | tr -d '[:space:]')

if [ "$SCHEMA_EXISTS" = "t" ]; then
  echo "✅ Database schema already exists, skipping initialization"
else
  echo "🔧 Initializing database schema..."
  docker exec postgres-illinois-chat psql -U postgres -d postgres -c "
  -- Create extensions that were provided by Supabase
  CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
  CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";

  -- Create schemas
  CREATE SCHEMA IF NOT EXISTS public;
  CREATE SCHEMA IF NOT EXISTS keycloak;

  -- Set up authentication tables (replacing Supabase auth)
  CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      encrypted_password VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create conversations table
  CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create messages table
  CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create documents table (for materials management)
  CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_name VARCHAR(255) NOT NULL,
      s3_path VARCHAR(500),
      readable_filename VARCHAR(255),
      url VARCHAR(500),
      base_url VARCHAR(500),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create documents_in_progress table
  CREATE TABLE IF NOT EXISTS documents_in_progress (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_name VARCHAR(255) NOT NULL,
      s3_path VARCHAR(500),
      readable_filename VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create API keys table
  CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      key_name VARCHAR(255) NOT NULL,
      key_value VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create folders table
  CREATE TABLE IF NOT EXISTS folders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Create conversation_folders junction table
  CREATE TABLE IF NOT EXISTS conversation_folders (
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, folder_id)
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_documents_course_name ON documents(course_name);
  CREATE INDEX IF NOT EXISTS idx_documents_in_progress_course_name ON documents_in_progress(course_name);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);

  -- Create updated_at trigger function
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS \$\$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  \$\$ language 'plpgsql';

  -- Create triggers for updated_at
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_documents_in_progress_updated_at BEFORE UPDATE ON documents_in_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  "
  echo "✅ Database schema initialized successfully"
fi

# Initialize Keycloak database schema (if using separate instance)
if docker ps | grep -q postgres-keycloak; then
  echo "Checking Keycloak database schema..."
  KEYCLOAK_SCHEMA_EXISTS=$(docker exec postgres-keycloak psql -U postgres -d postgres -t -c "SELECT EXISTS (SELECT FROM information_schema.schemata WHERE schema_name = 'keycloak');" | tr -d '[:space:]')
  
  if [ "$KEYCLOAK_SCHEMA_EXISTS" = "t" ]; then
    echo "✅ Keycloak schema already exists, skipping initialization"
  else
    echo "🔧 Initializing Keycloak database schema..."
    docker exec postgres-keycloak psql -U postgres -d postgres -c "
    CREATE SCHEMA IF NOT EXISTS keycloak;
    "
    echo "✅ Keycloak schema initialized successfully"
  fi
fi

echo "👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇"
echo "✅ All services are up and available at:"
echo "Frontend: http://localhost:3001"
echo "Backend: http://localhost:3012"
echo "Minio dashboard: http://localhost:9002"
echo "Qdrant: http://localhost:6333/dashboard"
echo "PostgreSQL (main): localhost:5432"
echo "PostgreSQL (Keycloak): localhost:5433"
echo "👆👆👆👆👆👆👆👆👆👆��👆👆👆👆👆👆👆👆"

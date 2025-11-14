# UIUC.chat Development Setup

This guide will help you set up the UIUC.chat development environment for local development.

## Prerequisites

- Docker and Docker Compose
- Python 3.8+
- Node.js 18+
- Infisical CLI (for environment management)

## Quick Start

### 1. Start Infrastructure Services

First, start the required infrastructure services (databases, Redis, etc.):

```bash
docker compose -f infra/docker/docker-compose.dev.yaml up -d
```

This will start:

- PostgreSQL (port 5432)
- Redis (port 6379)
- Qdrant (port 6333)
- MinIO (port 10000)
- RabbitMQ (port 5672)
- Keycloak (port 8080)

### 2. Run the Development Setup Script

```bash
./init-dev.sh
```

This script will:

- Check if required services are running
- Create environment files for backend and frontend
- Install Python and Node.js dependencies
- Create a start script for both services

### 3. Configure Environment Variables

Update the following files with your API keys:

- `apps/backend/.env` - Backend configuration
- `apps/frontend/.env.local` - Frontend configuration

**Required API Keys:**

- `OPENAI_API_KEY` - Your OpenAI API key for embeddings and chat

### 4. Start Development Services

```bash
./start-dev.sh
```

This will start both the Flask backend and Next.js frontend in development mode.

## Manual Setup (Alternative)

If you prefer to set up manually:

### Backend Setup

```bash
cd apps/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables (see apps/backend/.env)
# Start the server
infisical run --env=dev -- flask --app ai_ta_backend.main:app --debug run --port 8000
```

### Frontend Setup

```bash
cd apps/frontend

# Install dependencies
npm install

# Set up environment variables (see apps/frontend/.env.local)
# Start the development server
npm run dev
```

## Services Overview

| Service             | URL                    | Description               |
| ------------------- | ---------------------- | ------------------------- |
| Frontend            | http://localhost:3000  | Next.js application       |
| Backend API         | http://localhost:8000  | Flask API                 |
| Keycloak            | http://localhost:8080  | Authentication service    |
| MinIO Console       | http://localhost:9001  | Object storage management |
| RabbitMQ Management | http://localhost:15672 | Message queue management  |

## Database Configuration

The application supports two database configurations:

### PostgreSQL (Recommended)

```env
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=password
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
```

### SQLite (Alternative)

```env
SQLITE_DB_NAME=uiuc_chat_local.db
```

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check if the database is accessible: `docker exec postgres-illinois-chat pg_isready`

### Port Conflicts

- If ports are already in use, you can modify the port mappings in `infra/docker/docker-compose.dev.yaml`
- Update the corresponding environment variables in the `.env` files

### Missing Dependencies

- Backend: Ensure you're in the virtual environment and run `pip install -r requirements.txt`
- Frontend: Run `npm install` in the frontend directory

### Environment Variables

- Use `infisical secrets list` to see available secrets
- Use `infisical secrets set KEY=VALUE` to set new secrets

## Development Workflow

1. **Start infrastructure**: `docker compose -f infra/docker/docker-compose.dev.yaml up -d`
2. **Run setup**: `./init-dev.sh` (first time only)
3. **Start services**: `./start-dev.sh`
4. **Make changes** to your code
5. **Services auto-reload** with your changes
6. **Stop services**: `Ctrl+C` in the terminal running `start-dev.sh`

## Stopping Everything

```bash
# Stop development services
./start-dev.sh  # Then Ctrl+C

# Stop infrastructure services
docker compose -f infra/docker/docker-compose.dev.yaml down
```

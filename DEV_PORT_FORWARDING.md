# Development Port Forwarding Guide

This guide explains how to set up port forwarding for all UIUC Chat services running in your kind Kubernetes cluster.

## Quick Start

### 1. Set up all port forwards and environment variables:
```bash
./scripts/setup-dev-environment.sh
```

### 2. Or manually start just the port forwards:
```bash
./scripts/port-forward-all.sh --background
```

### 3. Create environment file for frontend:
```bash
cp uiuc-chat-frontend/env.local.dev.template uiuc-chat-frontend/.env.local.dev
```

### 4. Start the frontend:
```bash
cd uiuc-chat-frontend
npm run dev
```

## Port Forward Mapping

| Service | Local Port | Service Port | URL | Credentials |
|---------|------------|--------------|-----|-------------|
| **Keycloak Auth** | 8080 | 80 | http://localhost:8080/auth/admin | admin/admin |
| **PostgreSQL** | 5432 | 5432 | localhost:5432 | postgres/password |
| **Redis** | 6379 | 6379 | localhost:6379 | password: password |
| **Qdrant HTTP** | 6333 | 6333 | http://localhost:6333 | - |
| **Qdrant gRPC** | 6334 | 6334 | localhost:6334 | - |
| **RabbitMQ Management** | 15672 | 15672 | http://localhost:15672 | guest/guest |
| **RabbitMQ AMQP** | 5672 | 5672 | localhost:5672 | guest/guest |
| **MinIO S3 API** | 9000 | 9000 | http://localhost:9000 | minioadmin/minioadmin |
| **MinIO Console** | 9001 | 9001 | http://localhost:9001 | minioadmin/minioadmin |
| **Ollama API** | 11434 | 11434 | http://localhost:11434 | - |

## Important URLs for Development

### Authentication
- **Keycloak Admin Console**: http://localhost:8080/auth/admin
- **Keycloak Realm**: http://localhost:8080/auth/realms/illinois_chat_realm
- **Keycloak Client Config**: Available in admin console under `illinois_chat_realm` → Clients → `uiuc-chat-client`

### Data Services  
- **Qdrant Dashboard**: http://localhost:6333/dashboard
- **RabbitMQ Management**: http://localhost:15672
- **MinIO Console**: http://localhost:9001

## Environment Variables

Your frontend should use the environment variables from `.env.local.dev`:

```bash
# Key variables for authentication
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080/auth
NEXT_PUBLIC_KEYCLOAK_REALM=illinois_chat_realm
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=uiuc-chat-client

# Database connections
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
REDIS_URL=redis://:password@localhost:6379

# Other services
QDRANT_URL=http://localhost:6333
S3_ENDPOINT=http://localhost:9000
OLLAMA_URL=http://localhost:11434
```

## Scripts

### Start All Port Forwards
```bash
./scripts/port-forward-all.sh --background
```

### Stop All Port Forwards
```bash
./scripts/stop-port-forwards.sh
```

### Complete Development Setup
```bash
./scripts/setup-dev-environment.sh
```

## Troubleshooting

### Port Forward Issues
1. **Port already in use**: Run `./scripts/stop-port-forwards.sh` first
2. **Service not accessible**: Check if the pod is running with `kubectl get pods`
3. **Authentication failing**: Verify Keycloak is accessible at http://localhost:8080/auth

### Check Port Forward Status
```bash
ps aux | grep port-forward
```

### Check Service Status
```bash
kubectl get pods
kubectl get services
```

### Test Service Connectivity
```bash
# Test Keycloak
curl http://localhost:8080/auth/realms/illinois_chat_realm

# Test MinIO
curl http://localhost:9000/minio/health/live

# Test Qdrant
curl http://localhost:6333

# Test Ollama
curl http://localhost:11434/api/tags
```

## Common Issues

### 1. Login Button Not Working
- Ensure Keycloak port forward is active (port 8080)
- Check that `NEXT_PUBLIC_KEYCLOAK_URL` is set correctly
- Verify the client redirect URIs in Keycloak admin console include:
  - `http://localhost:3000/*`
  - `http://localhost:3000/silent-renew`

### 2. Redis Connection Issues
- Redis pods may have ImagePullBackOff issues in development
- The script will continue with other services if Redis fails
- Check pod status: `kubectl get pods | grep redis`

### 3. Database Connection Issues
- Ensure PostgreSQL port forward is active (port 5432)
- Verify `DATABASE_URL` in your environment file
- Test connection: `psql postgresql://postgres:password@localhost:5432/postgres`

## Development Workflow

1. **Start cluster and deploy Helm chart**:
   ```bash
   kind create cluster --name uiuc-chat
   helm install uiuc-chat-test ./helm-chart -f ./helm-chart/values-dev.yaml
   ```

2. **Set up port forwards**:
   ```bash
   ./scripts/setup-dev-environment.sh
   ```

3. **Start frontend**:
   ```bash
   cd uiuc-chat-frontend
   npm run dev
   ```

4. **Start backend** (in separate terminal):
   ```bash
   cd uiuc-chat-backend
   python -m ai_ta_backend.main
   ```

5. **Access application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8001

## Notes

- Port forwards run in background and will persist until stopped
- PIDs are tracked in `/tmp/uiuc-chat-port-forwards.pids`
- The scripts handle services that may not be ready gracefully
- Environment variables are configured for local development with port forwarding

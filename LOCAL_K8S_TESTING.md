# Local Kubernetes Testing Guide

This guide shows how to test the `helm-chart-setup` branch locally using Kubernetes (Kind or Minikube).

## Prerequisites

- Docker Desktop (or Docker Engine)
- `kubectl` (v1.24+)
- `helm` (v3.12+)
- One of: `kind` or `minikube`
- Optional: `mkcert` (for TLS), `jq`, `yq`

## Quick Start (Kind)

### 1. Create Kind Cluster with Ingress

```bash
# Create Kind cluster with port mapping for ingress
cat > /tmp/kind-uiuc.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF

kind create cluster --name uiuc --config /tmp/kind-uiuc.yaml
kubectl cluster-info --context kind-uiuc
```

### 2. Install NGINX Ingress Controller

```bash
kubectl create ns ingress-nginx || true
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.publishService.enabled=true
```

### 3. Deploy the Application

```bash
# Checkout the branch and init submodules
git fetch && git checkout helm-chart-setup
git submodule update --init --recursive

# Deploy using the Makefile
cd helm-chart
make dev NAMESPACE=uiuc

# Check status
make status NAMESPACE=uiuc
```

### 4. Wait for Pods to be Ready

```bash
kubectl -n uiuc get pods -w
# Wait until all pods show "Running" status
```

### 5. Access the Application

The Helm chart will show access URLs after installation. You can also use port-forwarding:

```bash
# Port-forward all services
make port-forward NAMESPACE=uiuc

# Or individual services:
kubectl -n uiuc port-forward svc/uiuc-chat-frontend 3000:3000 &
kubectl -n uiuc port-forward svc/uiuc-chat-backend 8001:8001 &
kubectl -n uiuc port-forward svc/uiuc-chat-minio 9001:9001 &
kubectl -n uiuc port-forward svc/uiuc-chat-keycloak 8080:8080 &
kubectl -n uiuc port-forward svc/uiuc-chat-qdrant 6333:6333 &
```

**Access URLs:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001
- MinIO Console: http://localhost:9001
- Keycloak: http://localhost:8080
- Qdrant: http://localhost:6333

### 6. Initialize Ollama Models (Optional)

```bash
# Port-forward Ollama service
kubectl -n uiuc port-forward svc/uiuc-chat-ollama 11434:11434 &

# Set environment and run init script
export OLLAMA_HOST=http://127.0.0.1:11434
bash scripts/init-ollama-models.sh
```

## Alternative: Minikube

If you prefer Minikube:

```bash
# Start Minikube with ingress addon
minikube start
minikube addons enable ingress

# Deploy the application
cd helm-chart
make dev NAMESPACE=uiuc

# Get access URL
minikube service uiuc-chat-frontend -n uiuc --url
```

## Available Makefile Commands

The `helm-chart/Makefile` provides these useful commands:

```bash
# Development deployment
make dev NAMESPACE=uiuc                    # Install dev stack
make dev-upgrade NAMESPACE=uiuc           # Upgrade dev stack
make dev-infra-only NAMESPACE=uiuc        # Deploy only infrastructure

# Management
make status NAMESPACE=uiuc                # Check deployment status
make logs NAMESPACE=uiuc                  # Show backend logs
make port-forward NAMESPACE=uiuc          # Port-forward all services
make restart NAMESPACE=uiuc               # Restart all deployments
make debug NAMESPACE=uiuc                 # Debug deployment issues

# Cleanup
make clean NAMESPACE=uiuc                 # Uninstall and clean up
```

## Verification Steps

### 1. Check Backend Health
```bash
curl -i http://localhost:8001/health
# or
curl -i http://localhost:8001/api/health
```

### 2. Test Qdrant
```bash
curl -s http://localhost:6333/collections
```

### 3. Access MinIO Console
Open http://localhost:9001 in browser (default: minioadmin/minioadmin)

### 4. Check Keycloak
Open http://localhost:8080 in browser

## Troubleshooting

### Common Issues

1. **Pods not starting**: Check logs with `kubectl -n uiuc logs <pod-name>`
2. **Services not accessible**: Ensure port-forwarding is running
3. **Database connection issues**: Check if PostgreSQL pod is ready
4. **Ingress not working**: Verify ingress controller is installed and running

### Debug Commands

```bash
# Check all resources
kubectl -n uiuc get all

# Check pod logs
kubectl -n uiuc logs -f deployment/uiuc-chat-backend

# Check events
kubectl -n uiuc get events --sort-by=.metadata.creationTimestamp

# Debug with Makefile
make debug NAMESPACE=uiuc
```

## Cleanup

```bash
# Clean up the deployment
make clean NAMESPACE=uiuc

# Delete the Kind cluster
kind delete cluster --name uiuc

# Or for Minikube
minikube delete
```

## Development Workflow

For active development, you might want to:

1. **Deploy infrastructure only**: `make dev-infra-only NAMESPACE=uiuc`
2. **Run frontend/backend locally** for hot reload
3. **Use port-forwarding** to connect local services to K8s infrastructure

This approach gives you the best of both worlds: K8s infrastructure with local development speed.

## Notes

- The chart uses `values-dev.yaml` by default for development
- All services are configured with appropriate resource limits for local development
- Ollama is enabled in dev mode for local LLM testing
- Network policies are disabled by default for easier local testing

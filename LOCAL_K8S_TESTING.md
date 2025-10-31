# Local Kubernetes (kind) Setup for UIUC Chat

## Prerequisites

- Docker Desktop (or Docker Engine)
- `kubectl` (v1.24+)
- `helm` (v3.12+)
- One of: `kind` or `minikube`
- Optional: `mkcert` (for TLS), `jq`, `yq`

## Prerequisites

- Docker Desktop (or Docker Engine)
- kubectl
- kind

## 1) Create kind cluster with host 80/443 mapped
Use the `kind-config.yaml` at the repo root:
```yaml
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
```
Then:
```bash
kind delete cluster
kind create cluster --config kind-config.yaml
```

## 2) Install NGINX Ingress Controller (kind)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl -n ingress-nginx wait --for=condition=Available --timeout=180s deploy/ingress-nginx-controller
```

## 3) Add hosts entry
```bash
echo "127.0.0.1 chat.local" | sudo tee -a /etc/hosts
```

## 4) TLS for https://chat.local/
- Self-signed certs can be created with openssl:
```bash
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout chat.local-key.pem -out chat.local.pem -days 825 \
  -subj "/CN=chat.local" -addext "subjectAltName=DNS:chat.local"
kubectl -n uiuc-chat create namespace uiuc-chat || true
kubectl -n uiuc-chat create secret tls uiuc-chat-tls \
  --cert=chat.local.pem --key=chat.local-key.pem
```

## 5) Build/load images (dev)
```bash
docker build -t uiuc-chat-frontend:v13 ./uiuc-chat-frontend
kind load docker-image uiuc-chat-frontend:v13
kind load docker-image uiuc-chat-backend:helm-merge-3
```

## 6) Apply manifests
```bash
kubectl apply -n uiuc-chat -f k8s-app/backend.yaml
kubectl apply -n uiuc-chat -f k8s-app/worker.yaml
kubectl apply -n uiuc-chat -f k8s-app/frontend.yaml
kubectl apply -n uiuc-chat -f k8s-app/ingress.yaml
kubectl -n uiuc-chat rollout status deploy/uiuc-chat-backend --timeout=180s
kubectl -n uiuc-chat rollout status deploy/uiuc-chat-frontend --timeout=180s
kubectl -n uiuc-chat rollout status deploy/uiuc-chat-worker --timeout=180s || true
```

**Note:** The `k8s-app/` YAML files are useful for iterative development - you can quickly rebuild and redeploy individual components (frontend, backend, worker) without redeploying the entire Helm chart.

## 7) Open the app
- HTTPS: `https://chat.local/`
- Keycloak: `https://chat.local/auth/`

If you prefer HTTP only, remove the `tls` section from `k8s-app/ingress.yaml` and set `NEXT_PUBLIC_KEYCLOAK_URL` in `k8s-app/frontend.yaml` back to `http://chat.local/auth/`, then re-apply and rebuild the frontend image.

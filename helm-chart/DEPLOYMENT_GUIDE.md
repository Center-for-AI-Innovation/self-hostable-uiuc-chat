# UIUC Chat Helm Deployment Guide

This guide shows you how to deploy the UIUC Chat application with pre-configured Keycloak using the Helm chart.

## Quick Start

### 1. Deploy with Pre-configured Keycloak

```bash
# For development
helm upgrade --install uiuc-chat ./helm-chart -f helm-chart/values-dev.yaml

# For production
helm upgrade --install uiuc-chat ./helm-chart -f helm-chart/values-prod.yaml

# For testing
helm upgrade --install uiuc-chat ./helm-chart -f helm-chart/values-test.yaml
```

### 2. Verify Deployment

```bash
# Check all pods are running
kubectl get pods

# Check Keycloak specifically
kubectl get pods | grep keycloak

# Check Keycloak logs for realm import
kubectl logs -l app.kubernetes.io/name=keycloak | grep -i import
```

### 3. Access Your Application

- **Frontend**: `http://localhost:3000` (if port-forwarded)
- **Keycloak Admin**: `http://localhost:8080/admin`
- **Keycloak Realm**: `http://localhost:8080/realms/illinois_chat_realm`

## What Happens Automatically

✅ **Keycloak starts with your pre-configured realm**
- Realm: `illinois_chat_realm`
- Display Name: `UIUC.chat`
- All clients, users, and settings from your export file

✅ **Custom theme is applied**
- Modern Keywind theme
- Custom branding for UIUC Chat

✅ **Frontend is configured**
- `NEXT_PUBLIC_KEYCLOAK_URL`: Points to Keycloak service
- `NEXT_PUBLIC_KEYCLOAK_REALM`: Set to `illinois_chat_realm`
- `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`: Set to `uiuc-chat-client`

✅ **Backend is configured**
- All necessary environment variables
- Database connections
- Service integrations

## Port Forwarding (for local access)

```bash
# Frontend
kubectl port-forward svc/uiuc-chat-frontend 3000:3000

# Keycloak
kubectl port-forward svc/uiuc-chat-keycloak-http 8080:80

# Backend API
kubectl port-forward svc/uiuc-chat-backend 8001:8001
```

## Troubleshooting

### Keycloak Not Importing Realm

```bash
# Check if ConfigMap exists
kubectl get configmap uiuc-chat-keycloak-realm

# Check Keycloak logs
kubectl logs -l app.kubernetes.io/name=keycloak

# Check if realm file is mounted
kubectl exec -it <keycloak-pod> -- ls -la /opt/keycloak/data/import/
```

### Frontend Can't Connect to Keycloak

```bash
# Check frontend environment variables
kubectl describe pod <frontend-pod>

# Verify Keycloak service is accessible
kubectl get svc | grep keycloak

# Test Keycloak connectivity from frontend pod
kubectl exec -it <frontend-pod> -- curl http://uiuc-chat-keycloak-http:80/health/ready
```

## Updating Configuration

To update the realm or theme:

1. **Modify source files**:
   - `keycloak/realms/realm-export.json` - for realm changes
   - `keycloak-theme/keywind/` - for theme changes

2. **Redeploy**:
   ```bash
   helm upgrade uiuc-chat ./helm-chart -f helm-chart/values-dev.yaml
   ```

3. **Restart Keycloak** (if needed):
   ```bash
   kubectl rollout restart statefulset uiuc-chat-keycloak
   ```

## Environment-Specific Notes

### Development (`values-dev.yaml`)
- Uses local PostgreSQL
- Single replica for all services
- Resource limits optimized for development
- Admin credentials: `admin/admin`

### Testing (`values-test.yaml`)
- Same as development with stricter resource limits
- Optimized for CI/CD environments

### Production (`values-prod.yaml`)
- Uses external database
- Multiple replicas for high availability
- Enhanced security settings
- Requires external secret management

## Next Steps

After deployment:

1. **Access Keycloak Admin Console**
2. **Verify your realm is imported** (`illinois_chat_realm`)
3. **Check that your custom theme is active**
4. **Test frontend authentication flow**
5. **Configure any additional users or clients as needed**

Your UIUC Chat application is now ready to use with pre-configured authentication! 🚀

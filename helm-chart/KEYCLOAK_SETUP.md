# Keycloak Setup in Helm Chart

This document explains how the Keycloak realm setup files are integrated into the Helm chart deployment using the Codecentric Keycloak dependency chart.

## Overview

The Helm chart now includes automatic import of:
- **Realm Configuration**: Pre-configured `illinois_chat_realm` with users, clients, and settings
- **Custom Theme**: Modern Keywind theme for the login interface

This setup ensures that Keycloak is pre-configured and ready to work with your frontend and backend applications immediately after deployment.

## Files Included

### 1. Realm Export
- **Source**: `keycloak/realms/realm-export.json`
- **ConfigMap**: `uiuc-chat-keycloak-realm`
- **Mount Path**: `/opt/keycloak/data/import/` (entire directory)
- **Realm Name**: `illinois_chat_realm`

### 2. Custom Theme
- **Source**: `keycloak-theme/keywind/` directory
- **ConfigMap**: `uiuc-chat-keycloak-theme`
- **Mount Path**: `/opt/keycloak/themes/keywind`

## Configuration

The Keycloak configuration is automatically applied through the following Helm values:

```yaml
keycloak:
  enabled: true
  auth:
    adminUser: "admin"
    adminPassword: "admin"
  # Realm import configuration
  extraVolumes: |
    - name: realm-config
      configMap:
        name: uiuc-chat-keycloak-realm
    - name: theme-config
      configMap:
        name: uiuc-chat-keycloak-theme
  extraVolumeMounts: |
    - name: realm-config
      mountPath: /opt/keycloak/data/import
      readOnly: true
    - name: theme-config
      mountPath: /opt/keycloak/themes/keywind
      readOnly: true
  # Enable realm import
  extraArgs: |
    --import-realm
  # Custom theme configuration
  extraEnv: |
    - name: KC_SPI_THEME_STATIC_MAX_AGE
      value: "2592000"
    - name: KC_SPI_THEME_CACHE_THEMES
      value: "true"
    - name: KC_SPI_THEME_CACHE_TEMPLATES
      value: "true"
```

## Deployment

### 1. Install/Upgrade the Chart

```bash
# For development
helm upgrade --install uiuc-chat ./helm-chart -f helm-chart/values-dev.yaml

# For production
helm upgrade --install uiuc-chat ./helm-chart -f helm-chart/values-prod.yaml

# For testing
helm upgrade --install uiuc-chat ./helm-chat -f helm-chart/values-test.yaml
```

### 2. Verify Deployment

```bash
# Check if ConfigMaps are created
kubectl get configmaps | grep keycloak

# Check Keycloak pod status
kubectl get pods | grep keycloak

# Check Keycloak logs
kubectl logs -l app.kubernetes.io/name=keycloak
```

### 3. Access Keycloak

- **Admin Console**: `http://localhost:8080/admin`
- **Realm**: `http://localhost:8080/realms/illinois_chat_realm`
- **Login**: Use the custom Keywind theme

## Realm Configuration

The imported realm includes:

- **Realm Name**: `illinois_chat_realm`
- **Display Name**: `UIUC.chat`
- **Clients**: Pre-configured for the UIUC Chat application
- **Users**: Default users (if configured in the export)
- **Settings**: Optimized for the application
- **Frontend Integration**: Configured to work with `NEXT_PUBLIC_KEYCLOAK_REALM=illinois_chat_realm`

## Custom Theme

The Keywind theme provides:
- Modern, responsive design
- Custom branding for UIUC Chat
- Improved user experience
- Consistent styling across login flows

## Troubleshooting

### Realm Not Importing

1. Check if the ConfigMap exists:
   ```bash
   kubectl describe configmap uiuc-chat-keycloak-realm
   ```

2. Verify the realm file is mounted:
   ```bash
   kubectl exec -it <keycloak-pod> -- ls -la /opt/keycloak/data/import/
   ```

3. Check Keycloak logs for import errors:
   ```bash
   kubectl logs <keycloak-pod> | grep -i import
   ```

### Theme Not Loading

1. Check if the theme ConfigMap exists:
   ```bash
   kubectl describe configmap uiuc-chat-keycloak-theme
   ```

2. Verify theme files are mounted:
   ```bash
   kubectl exec -it <keycloak-pod> -- ls -la /opt/keycloak/themes/keywind/
   ```

3. Check Keycloak admin console for theme selection

### Updating Configuration

To update the realm or theme:

1. Modify the source files in `keycloak/realms/` or `keycloak-theme/`
2. Upgrade the Helm chart:
   ```bash
   helm upgrade uiuc-chat ./helm-chat -f helm-chart/values-dev.yaml
   ```
3. Restart Keycloak if needed:
   ```bash
   kubectl rollout restart statefulset uiuc-chat-keycloak
   ```

## Security Considerations

- Admin credentials are set via Helm values
- Database credentials are managed through secrets
- Theme files are read-only mounted
- Realm import happens automatically on startup

## Environment-Specific Configuration

- **Development**: Uses local PostgreSQL with realm import
- **Testing**: Same as development with resource limits
- **Production**: Uses external database with enhanced security settings

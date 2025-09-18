# Keycloak Environment Setup for Login Redirect Fix

## Critical Fix Applied

The issue with the login redirect was in the `NEXT_PUBLIC_KEYCLOAK_URL` environment variable configuration.

### ✅ Correct Configuration

```bash
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080/auth/
NEXT_PUBLIC_KEYCLOAK_REALM=illinois_chat_realm
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=uiuc-chat-client
```

### 🔧 How the URL Construction Works

1. **Environment Variable**: `NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080/auth/`
2. **Realm Path**: `realms/illinois_chat_realm`
3. **Final Authority URL**: `http://localhost:8080/auth/realms/illinois_chat_realm`

### 📋 Setup Steps

1. **Copy the corrected environment file**:
   ```bash
   cp uiuc-chat-frontend/env.local.dev.fixed uiuc-chat-frontend/.env.local.dev
   ```

2. **Verify Keycloak is accessible**:
   ```bash
   curl http://localhost:8080/auth/realms/illinois_chat_realm
   ```

3. **Check client configuration in Keycloak Admin**:
   - Go to: http://localhost:8080/auth/admin (admin/admin)
   - Navigate to: `illinois_chat_realm` → Clients → `uiuc-chat-client`
   - Ensure Valid Redirect URIs include:
     - `http://localhost:3000/*`
     - `http://localhost:3000/silent-renew`

4. **Start your frontend**:
   ```bash
   cd uiuc-chat-frontend
   npm run dev
   ```

### 🎯 What This Fixes

- **Login Button Redirect**: Now properly constructs the Keycloak authorization URL
- **Token Exchange**: Correct realm endpoint for token validation
- **Silent Refresh**: Proper URL for silent token renewal

### 🔍 Verification

The login button should now redirect to:
```
http://localhost:8080/auth/realms/illinois_chat_realm/protocol/openid-connect/auth?...
```

Instead of a broken URL that would cause 404 errors.

### 📝 Key Changes Made

1. **Environment Variable**: Fixed `NEXT_PUBLIC_KEYCLOAK_URL` to include `/auth/` path
2. **Port Forwarding**: Ensured Keycloak service is accessible on localhost:8080
3. **URL Construction**: Verified that `getKeycloakBaseUrl()` + `realms/` + `realm_name` creates valid URL

### 🚀 Next Steps

After copying the environment file and starting the frontend, the login button should work correctly and redirect to Keycloak for authentication.

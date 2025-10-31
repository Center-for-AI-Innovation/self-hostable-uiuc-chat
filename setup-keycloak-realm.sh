#!/bin/bash

echo "Setting up Keycloak realm manually..."

# Wait for Keycloak to be ready
echo "Waiting for Keycloak to be ready..."
until curl -f http://localhost:8080/auth/realms/master > /dev/null 2>&1; do
  echo "Keycloak not ready yet, waiting..."
  sleep 5
done

echo "Keycloak is ready!"

# Get admin token
echo "Getting admin token..."
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8080/auth/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" | \
  jq -r '.access_token')

if [ "$ADMIN_TOKEN" = "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Failed to get admin token"
  exit 1
fi

echo "Admin token obtained successfully!"

# Create the realm
echo "Creating realm..."
REALM_RESPONSE=$(curl -s -X POST http://localhost:8080/auth/admin/realms \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "illinois_chat_realm",
    "displayName": "UIUC.chat",
    "enabled": true
  }')

echo "Realm creation response: $REALM_RESPONSE"

# Create a client for the realm
echo "Creating client..."
CLIENT_RESPONSE=$(curl -s -X POST http://localhost:8080/auth/admin/realms/illinois_chat_realm/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "uiuc-chat-client",
    "enabled": true,
    "publicClient": true,
    "standardFlowEnabled": true,
    "implicitFlowEnabled": false,
    "directAccessGrantsEnabled": true,
    "redirectUris": [
      "http://chat.local/*",
      "https://chat.local/*",
      "http://localhost:3000/*"
    ],
    "webOrigins": [
      "http://chat.local",
      "https://chat.local",
      "http://localhost:3000"
    ],
    "attributes": {
      "post.logout.redirect.uris": "http://chat.local/*##https://chat.local/*##http://localhost:3000/*"
    }
  }')

echo "Client creation response: $CLIENT_RESPONSE"

# Create a test user
echo "Creating test user..."
USER_RESPONSE=$(curl -s -X POST http://localhost:8080/auth/admin/realms/illinois_chat_realm/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "enabled": true,
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User"
  }')

echo "User creation response: $USER_RESPONSE"

# Set password for the test user
echo "Setting test user password..."
PASSWORD_RESPONSE=$(curl -s -X PUT http://localhost:8080/auth/admin/realms/illinois_chat_realm/users/testuser/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "password",
    "value": "testpassword",
    "temporary": false
  }')

echo "Password set response: $PASSWORD_RESPONSE"

echo "Realm setup completed!"

#!/bin/bash

echo "Updating Keycloak client configuration via ingress..."

KEYCLOAK_URL="http://chat.local/auth"

# Wait for Keycloak to be ready
echo "Waiting for Keycloak to be ready..."
for i in {1..30}; do
  if curl -f ${KEYCLOAK_URL}/realms/master > /dev/null 2>&1; then
    echo "Keycloak is ready!"
    break
  fi
  echo "Waiting... ($i/30)"
  sleep 2
done

# Get admin token
echo "Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST ${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli")

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//' | sed 's/"//')

if [ -z "$ADMIN_TOKEN" ]; then
  echo "Failed to get admin token"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "Admin token obtained successfully!"

# Get the client list
echo "Getting client UUID..."
CLIENT_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/illinois_chat_realm/clients?clientId=uiuc-chat-client" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

# Extract UUID using grep and sed
CLIENT_UUID=$(echo "$CLIENT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//' | sed 's/"//')

if [ -z "$CLIENT_UUID" ]; then
  echo "Failed to get client UUID. Client may not exist."
  echo "Response: $CLIENT_RESPONSE"
  exit 1
fi

echo "Client UUID: $CLIENT_UUID"

# Update the client configuration
echo "Updating client configuration..."
UPDATE_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "${KEYCLOAK_URL}/admin/realms/illinois_chat_realm/clients/$CLIENT_UUID" \
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
      "http://localhost:3000",
      "+"
    ],
    "attributes": {
      "post.logout.redirect.uris": "http://chat.local/*##https://chat.local/*##http://localhost:3000/*",
      "backchannel.logout.session.required": "true",
      "backchannel.logout.revoke.offline.tokens": "false"
    }
  }')

HTTP_STATUS=$(echo "$UPDATE_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | sed 's/HTTP_STATUS://')
echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "200" ]; then
  echo "✓ Client configuration updated successfully!"
else
  echo "✗ Failed to update client configuration"
  echo "Response: $UPDATE_RESPONSE"
  exit 1
fi

# Verify the update
echo ""
echo "Verifying client configuration..."
VERIFY_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/illinois_chat_realm/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "Redirect URIs:"
echo "$VERIFY_RESPONSE" | grep -o '"redirectUris":\[[^]]*\]' | sed 's/"redirectUris"://'

echo ""
echo "Web Origins:"
echo "$VERIFY_RESPONSE" | grep -o '"webOrigins":\[[^]]*\]' | sed 's/"webOrigins"://'

echo ""
echo "✓ Update complete!"


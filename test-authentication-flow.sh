#!/bin/bash

echo "=========================================="
echo "Testing UIUC Chat Authentication Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

KEYCLOAK_URL="http://chat.local/auth"
FRONTEND_URL="http://chat.local"
BACKEND_URL="http://chat.local/backend"

success_count=0
failure_count=0

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Testing $name... "
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1)
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ OK (HTTP $response)${NC}"
        ((success_count++))
        return 0
    else
        echo -e "${RED}✗ FAILED (HTTP $response, expected $expected_status)${NC}"
        ((failure_count++))
        return 1
    fi
}

echo "1. Testing Keycloak Endpoints"
echo "------------------------------"
test_endpoint "Keycloak Master Realm" "$KEYCLOAK_URL/realms/master"
test_endpoint "Keycloak Illinois Chat Realm" "$KEYCLOAK_URL/realms/illinois_chat_realm"
test_endpoint "Keycloak OIDC Configuration" "$KEYCLOAK_URL/realms/illinois_chat_realm/.well-known/openid-configuration"
echo ""

echo "2. Testing Backend Endpoints"
echo "------------------------------"
test_endpoint "Backend Health Check" "$BACKEND_URL/health"
echo ""

echo "3. Testing Frontend"
echo "------------------------------"
test_endpoint "Frontend Root" "$FRONTEND_URL/"
echo ""

echo "4. Verifying Keycloak Client Configuration"
echo "-------------------------------------------"

# Get admin token
TOKEN_RESPONSE=$(curl -s -X POST ${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli")

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//' | sed 's/"//')

if [ -n "$ADMIN_TOKEN" ]; then
    echo -e "${GREEN}✓ Successfully obtained admin token${NC}"
    ((success_count++))
    
    # Get client configuration
    CLIENT_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/illinois_chat_realm/clients?clientId=uiuc-chat-client" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json")
    
    CLIENT_UUID=$(echo "$CLIENT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//' | sed 's/"//')
    
    if [ -n "$CLIENT_UUID" ]; then
        echo -e "${GREEN}✓ Found uiuc-chat-client (UUID: $CLIENT_UUID)${NC}"
        ((success_count++))
        
        # Get full client config
        FULL_CONFIG=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/illinois_chat_realm/clients/$CLIENT_UUID" \
          -H "Authorization: Bearer $ADMIN_TOKEN" \
          -H "Content-Type: application/json")
        
        # Check redirect URIs
        REDIRECT_URIS=$(echo "$FULL_CONFIG" | grep -o '"redirectUris":\[[^]]*\]')
        echo "  Redirect URIs: $REDIRECT_URIS"
        
        if echo "$REDIRECT_URIS" | grep -q "chat.local"; then
            echo -e "  ${GREEN}✓ chat.local redirect URIs configured${NC}"
            ((success_count++))
        else
            echo -e "  ${RED}✗ Missing chat.local redirect URIs${NC}"
            ((failure_count++))
        fi
        
        # Check web origins
        WEB_ORIGINS=$(echo "$FULL_CONFIG" | grep -o '"webOrigins":\[[^]]*\]')
        echo "  Web Origins: $WEB_ORIGINS"
        
        if echo "$WEB_ORIGINS" | grep -q "chat.local"; then
            echo -e "  ${GREEN}✓ chat.local web origins configured${NC}"
            ((success_count++))
        else
            echo -e "  ${RED}✗ Missing chat.local web origins${NC}"
            ((failure_count++))
        fi
        
        # Check if public client
        IS_PUBLIC=$(echo "$FULL_CONFIG" | grep -o '"publicClient":[^,}]*' | sed 's/"publicClient"://')
        echo "  Public Client: $IS_PUBLIC"
        
        if [ "$IS_PUBLIC" = "true" ]; then
            echo -e "  ${GREEN}✓ Client is configured as public${NC}"
            ((success_count++))
        else
            echo -e "  ${YELLOW}⚠ Client is not configured as public${NC}"
        fi
    else
        echo -e "${RED}✗ Failed to find uiuc-chat-client${NC}"
        ((failure_count++))
    fi
else
    echo -e "${RED}✗ Failed to obtain admin token${NC}"
    ((failure_count++))
fi

echo ""
echo "5. Testing Network Connectivity from Frontend Pod"
echo "--------------------------------------------------"

FRONTEND_POD=$(kubectl get pods -n default -l app=uiuc-chat-frontend -o jsonpath='{.items[0].metadata.name}')

if [ -n "$FRONTEND_POD" ]; then
    echo "Frontend Pod: $FRONTEND_POD"
    
    # Test backend connectivity
    echo -n "  Testing frontend -> backend connectivity... "
    if kubectl exec -n default $FRONTEND_POD -- wget -O- --timeout=5 http://uiuc-chat-backend:8001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        ((success_count++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((failure_count++))
    fi
    
    # Test Keycloak connectivity via service
    echo -n "  Testing frontend -> keycloak connectivity... "
    if kubectl exec -n default $FRONTEND_POD -- wget -O- --timeout=5 http://uiuc-chat-keycloak-http:80/auth/realms/master > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        ((success_count++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((failure_count++))
    fi
else
    echo -e "${RED}✗ Could not find frontend pod${NC}"
    ((failure_count++))
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Successful tests: ${GREEN}$success_count${NC}"
echo -e "Failed tests: ${RED}$failure_count${NC}"
echo ""

if [ $failure_count -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! Your authentication setup is ready.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Access http://chat.local in your browser"
    echo "2. Click the login button"
    echo "3. Use credentials: testuser / testpassword"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
    exit 1
fi


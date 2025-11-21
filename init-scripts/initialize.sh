#!/bin/bash

set -e  # Exit on first error
set -o pipefail

# define variables
PROJECT_NAME="chat"
PROJECT_DESC="Default project created during setup."
PROJECT_EMAIL="admin@example.com"

# Initialize the postgres database
echo "Setting up database from uiuc-chat-frontend."

cd uiuc-chat-frontend

echo "Installing dependencies."
npm install

echo "Pushing database schema to PostgreSQL."
npm run db:push

echo "Populating PostgreSQL database."
npm run db:populate

cd ..

# Populate Qdrant
echo "Creating Qdrant collection..."
# Ensure QDRANT_URL is defined
if [[ -z "$QDRANT_URL" ]]; then
  echo "Environment variable QDRANT_URL is not set. Aborting."
  exit 1
fi
curl -X PUT "${QDRANT_URL}/collections/my-collection" \
  -H "Content-Type: application/json" \
  -d '{
        "vectors": {
          "size": 768,
          "distance": "Cosine"
        }
      }'

# Create Default Global Project
curl -X POST "${RAILWAY_URL}/createProject" \
  -H "Content-Type: application/json" \
  -d "{
        \"project_name\": \"$PROJECT_NAME\",
        \"project_description\": \"$PROJECT_DESC\",
        \"project_owner_email\": \"$PROJECT_EMAIL\"
      }"

# TODO: Keycloak Setup Reminder
echo "==> Setting up Keycloak realms (manual or mounted)..."
echo "NOTE: Keycloak realm setup currently depends on mounted config. Ensure realms are manually created or automated in AWS deployments."

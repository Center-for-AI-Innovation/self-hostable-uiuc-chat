#!/bin/bash
# Run this script to initialize all database after a fresh docker compose up.

set -e  # Exit on first error
set -o pipefail

# Source the .env file to load the variables
source ./.env


# Export PostgreSQL environment variables so they're available to npm/Node.js processes
export POSTGRES_USERNAME
export POSTGRES_PASSWORD
export POSTGRES_ENDPOINT
export POSTGRES_PORT
export POSTGRES_DATABASE

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
curl -X PUT "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${QDRANT_API_KEY}" \
  -d '{
        "vectors": {
          "size": 1536,
          "distance": "Cosine"
        }
      }'

# Create Default Global Project
curl -X POST "${RAILWAY_URL}/createProject" \
  -H "Content-Type: application/json" \
  -d "{
        \"project_name\": \"$PROJECT_NAME\",
        \"project_description\": \"$PROJECT_DESC\",
        \"project_owner_email\": \"$PROJECT_EMAIL\",
        \"allow_logged_in_users\": true
      }"

# TODO: Keycloak Setup Reminder
echo "Keycloak realm setup is done by mouting the keycloak-realm.json file in the container at startup. 
echo "Make sure realm was loaded correctly if you are having issues with keycloak."

echo "Initialization complete."

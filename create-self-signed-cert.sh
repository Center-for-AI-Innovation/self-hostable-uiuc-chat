#!/bin/bash

echo "Creating self-signed TLS certificate for chat.local..."

# Create a temporary directory for cert generation
CERT_DIR=$(mktemp -d)
cd "$CERT_DIR"

# Generate private key
openssl genrsa -out tls.key 2048

# Generate certificate signing request and self-signed certificate
openssl req -new -x509 -key tls.key -out tls.crt -days 365 -subj "/CN=chat.local/O=UIUC Chat/C=US" \
  -addext "subjectAltName=DNS:chat.local,DNS:*.chat.local"

# Create Kubernetes TLS secret
kubectl create secret tls uiuc-chat-tls \
  --cert=tls.crt \
  --key=tls.key \
  -n default \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✓ TLS certificate created successfully!"

# Verify the secret
kubectl get secret uiuc-chat-tls -n default

# Clean up
cd -
rm -rf "$CERT_DIR"

echo ""
echo "Self-signed certificate installed. Your browser will show a security warning."
echo "To proceed:"
echo "  1. In your browser, when you see 'Your connection is not private'"
echo "  2. Click 'Advanced' or 'Show Details'"
echo "  3. Click 'Proceed to chat.local (unsafe)' or 'Accept the Risk and Continue'"
echo ""
echo "For Chrome: type 'thisisunsafe' when viewing the warning page"
echo "For Firefox: Click 'Advanced' → 'Accept the Risk and Continue'"
echo "For Safari: Click 'Show Details' → 'visit this website'"


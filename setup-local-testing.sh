#!/bin/bash

echo "Setting up local testing environment..."

# Option 1: Use NodePort services (simplest)
echo "=== Option 1: NodePort Services"
echo "1. Apply NodePort services:"
kubectl apply -f k8s-app/frontend-nodeport.yaml
echo ""
echo "2. Update frontend to use localhost URLs:"
echo "   kubectl patch deployment uiuc-chat-frontend -n uiuc-chat --type='merge' -p='{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"frontend\",\"env\":[{\"name\":\"NEXT_PUBLIC_KEYCLOAK_URL\",\"value\":\"http://localhost:30081/\"}]}]}}}}'"
echo ""
echo "3. Access URLs:"
echo "   Frontend: http://localhost:30080"
echo "   Keycloak: http://localhost:30081"

echo ""
echo "=== Option 2: Use Ingress with local DNS"
echo "1. Add to /etc/hosts:"
echo "   127.0.0.1 chat.local"

echo "2. Install nginx ingress controller:"
echo "   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/kind/deploy.yaml"

echo "3. Wait for ingress controller to be ready:"
echo "   kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=90s"

echo "4. Apply ingress configuration:"
echo "   helm upgrade uiuc-chat ./helm-chart -f helm-chart/values-dev.yaml"

echo "5. Access URL:"
echo "   http://chat.local"

echo ""
echo "=== Option 3: Use kubectl port-forward (current approach)"
echo "1. Start port forwards:"
echo "   kubectl port-forward -n uiuc-chat service/uiuc-chat-frontend 3000:3000 &"
echo "   kubectl port-forward -n uiuc-chat service/uiuc-chat-keycloak-http 8080:80 &"

echo "2. Access URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Keycloak: http://localhost:8080"

echo ""
echo "Choose your preferred option and run the corresponding commands!"

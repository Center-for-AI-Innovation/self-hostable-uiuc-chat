# UIUC Chat Helm Chart Makefile

# Default values
CHART_NAME := uiuc-chat
RELEASE_NAME := uiuc-chat
NAMESPACE := default
VALUES_FILE := values.yaml

# Helm commands
.PHONY: help install upgrade uninstall lint template dependency-update dev prod clean port-forward

help: ## Show this help message
	@echo "UIUC Chat Helm Chart Commands:"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

dependency-update: ## Update chart dependencies
	@echo "Updating Helm dependencies..."
	helm dependency update .

lint: ## Lint the Helm chart
	@echo "Linting Helm chart..."
	helm lint .

template: ## Generate Kubernetes manifests
	@echo "Generating Kubernetes templates..."
	helm template $(RELEASE_NAME) . -f $(VALUES_FILE)

install: dependency-update ## Install the chart
	@echo "Installing $(CHART_NAME) chart..."
	helm install $(RELEASE_NAME) . -f $(VALUES_FILE) --namespace $(NAMESPACE) --create-namespace

upgrade: dependency-update ## Upgrade the chart
	@echo "Upgrading $(CHART_NAME) chart..."
	helm upgrade $(RELEASE_NAME) . -f $(VALUES_FILE) --namespace $(NAMESPACE)

uninstall: ## Uninstall the chart
	@echo "Uninstalling $(CHART_NAME) chart..."
	helm uninstall $(RELEASE_NAME) --namespace $(NAMESPACE)

dev: ## Deploy in development mode
	@echo "Deploying in development mode..."
	$(MAKE) install VALUES_FILE=values-dev.yaml

dev-upgrade: ## Upgrade in development mode
	@echo "Upgrading in development mode..."
	$(MAKE) upgrade VALUES_FILE=values-dev.yaml

prod: ## Deploy in production mode
	@echo "Deploying in production mode..."
	$(MAKE) install VALUES_FILE=values-prod.yaml

prod-upgrade: ## Upgrade in production mode
	@echo "Upgrading in production mode..."
	$(MAKE) upgrade VALUES_FILE=values-prod.yaml

status: ## Show deployment status
	@echo "Checking deployment status..."
	helm status $(RELEASE_NAME) --namespace $(NAMESPACE)
	@echo ""
	kubectl get pods -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE)

logs: ## Show application logs
	@echo "Showing backend logs..."
	kubectl logs -f deployment/$(RELEASE_NAME)-backend --namespace $(NAMESPACE)

port-forward: ## Set up port forwarding for local access
	@echo "Setting up port forwarding..."
	@echo "Frontend: http://localhost:3000"
	@echo "Backend: http://localhost:8001"
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"
	@echo "RabbitMQ: localhost:5672"
	@echo "MinIO Console: http://localhost:9001"
	@echo "Keycloak: http://localhost:8080"
	@echo "Qdrant: http://localhost:6333"
	@echo "Ollama: http://localhost:11434"
	@echo ""
	kubectl port-forward service/$(RELEASE_NAME)-frontend 3000:3000 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-backend 8001:8001 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-postgresql 5432:5432 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-redis-master 6379:6379 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-rabbitmq 5672:5672 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-minio 9001:9001 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-keycloak-http 8080:80 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-qdrant 6333:6333 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-ollama 11434:11434 --namespace $(NAMESPACE) &
	@echo "Port forwarding started. Press Ctrl+C to stop all forwards."
	@wait

port-forward-infra: ## Set up port forwarding for infrastructure services only
	@echo "Setting up infrastructure port forwarding..."
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"
	@echo "RabbitMQ: localhost:5672"
	@echo "MinIO Console: http://localhost:9001"
	@echo "Keycloak: http://localhost:8080"
	@echo "Qdrant: http://localhost:6333"
	@echo "Ollama: http://localhost:11434"
	@echo ""
	kubectl port-forward service/$(RELEASE_NAME)-postgresql 5432:5432 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-redis-master 6379:6379 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-rabbitmq 5672:5672 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-minio 9001:9001 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-keycloak-http 8080:80 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-qdrant 6333:6333 --namespace $(NAMESPACE) &
	kubectl port-forward service/$(RELEASE_NAME)-ollama 11434:11434 --namespace $(NAMESPACE) &
	@echo "Infrastructure port forwarding started. Press Ctrl+C to stop all forwards."
	@wait

dev-infra-only: ## Deploy only infrastructure services for local development
	@echo "Deploying infrastructure services only for local development..."
	helm install $(RELEASE_NAME) . -f values-dev.yaml \
		--set frontend.enabled=false \
		--set backend.enabled=false \
		--set worker.enabled=false \
		--namespace $(NAMESPACE) --create-namespace

clean: uninstall ## Clean up deployment and persistent volumes
	@echo "Cleaning up persistent volumes..."
	kubectl delete pvc -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE) --ignore-not-found=true

restart: ## Restart all deployments
	@echo "Restarting all deployments..."
	kubectl rollout restart deployment -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE)

debug: ## Debug deployment issues
	@echo "Debugging deployment..."
	@echo "=== Helm Status ==="
	helm status $(RELEASE_NAME) --namespace $(NAMESPACE) || true
	@echo ""
	@echo "=== Pod Status ==="
	kubectl get pods -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE)
	@echo ""
	@echo "=== Service Status ==="
	kubectl get services -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE)
	@echo ""
	@echo "=== PVC Status ==="
	kubectl get pvc -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE)
	@echo ""
	@echo "=== Recent Events ==="
	kubectl get events --sort-by=.metadata.creationTimestamp --namespace $(NAMESPACE) | tail -20

test: lint template ## Run chart tests
	@echo "Running chart tests..."
	helm test $(RELEASE_NAME) --namespace $(NAMESPACE) || true

# Development workflow shortcuts
dev-reset: clean dev ## Reset development environment
	@echo "Development environment reset complete"

prod-reset: clean prod ## Reset production environment (use with caution!)
	@echo "Production environment reset complete"

# Backup and restore (requires additional tooling)
backup: ## Create backup of persistent data
	@echo "Creating backup... (implement backup strategy)"
	@echo "Consider using tools like Velero for production backups"

# Security scanning (requires additional tooling)
security-scan: ## Run security scan on generated manifests
	@echo "Running security scan..."
	helm template $(RELEASE_NAME) . -f $(VALUES_FILE) | kubectl neat | kubesec scan -

# Documentation generation
docs: ## Generate documentation
	@echo "Generating documentation..."
	helm-docs .

.DEFAULT_GOAL := help



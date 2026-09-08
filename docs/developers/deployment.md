# Cloud Deployment

How the hosted instance is deployed, and a starting point for deploying your own. For single-machine deployments, [Docker Compose self-hosting](../self-hosting/index.md) is much simpler — use this page when you need managed cloud infrastructure.

## Architecture

```
GitHub → GitHub Actions → AWS ECR → AWS ECS Fargate
```

1. **GitHub Actions** builds Docker images and pushes them to ECR.
2. **ECR** stores the container images.
3. **ECS Fargate** runs the containers.
4. **CloudWatch** collects logs and metrics.

## CI/CD workflows

The monorepo ships three workflows in `.github/workflows/`:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `illinois-chat-dev.yml` | push to the deployment branch (paths: `apps/**`, `infra/**`) | Builds and pushes four images (backend, ingest worker, frontend, crawlee) to ECR tagged with the commit SHA, then forces a new deployment on the ECS services. |
| `release-images.yml` | publishing a GitHub release | Builds and pushes release images tagged with the release tag. |
| `pr-checks.yml` | pull requests | Lint checks via Trunk. |

Configure repository secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` under **Settings → Secrets and variables → Actions**.

## Backend on ECS

The backend includes an ECS-optimized image (`apps/backend/Dockerfile.ecs`) and a task definition. The application exposes a health check:

```json
GET /health
{"status": "healthy", "service": "ai-ta-backend", "timestamp": 1643723400.123}
```

Customize the workflow and task definition for your AWS region, ECR repository names, ECS cluster/service names, CPU/memory allocation, and environment variables (prefer AWS Secrets Manager for sensitive values).

## Monitoring

- **Logs** — CloudWatch, under the ECS log groups.
- **Metrics** — ECS service metrics in CloudWatch.
- **Health** — HTTP health check on `/health`.

### Useful commands

```bash
# check service status
aws ecs describe-services --cluster <cluster> --services <service>

# tail recent logs
aws logs tail /ecs/<service> --follow

# force a new deployment
aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
```

## Cost and security practices

- Use Fargate Spot for non-production environments; configure auto-scaling; set CloudWatch cost alarms.
- Store sensitive values in AWS Secrets Manager; use minimal IAM roles; enable CloudTrail; run production tasks in private subnets.

## Troubleshooting

- **Service won't start** — check CloudWatch logs, verify the task definition, confirm the ECR image exists.
- **Image pull errors** — verify IAM permissions for ECR and that the image was pushed.
- **Network connectivity** — check security-group rules, subnet configuration, and public-IP assignment.

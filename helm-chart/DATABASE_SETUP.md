# Database Schema Setup

This Helm chart includes automatic database schema initialization for the UIUC Chat application.

## Overview

The database schema setup is handled by a Kubernetes Job that runs after PostgreSQL is deployed. This ensures that all required tables and indexes are created automatically.

## Configuration

The schema initialization can be controlled via the `values.yaml` file:

```yaml
postgresql:
  enabled: true
  schema:
    enabled: true  # Set to false to skip automatic schema setup
```

## What Gets Created

The schema setup job creates the following database objects:

### Core Tables
- `llm-convo-monitor` - Main conversation monitoring table
- `documents` - Document storage and metadata
- `doc_groups` - Document grouping functionality
- `documents_failed` - Failed document processing tracking
- `documents_in_progress` - In-progress document processing

### Additional Tables
- `llm-guided-contexts` - LLM guided contexts
- `llm-guided-docs` - LLM guided documents
- `llm-guided-sections` - LLM guided sections
- `doc_groups_sharing` - Document group sharing permissions
- `documents_doc_groups` - Many-to-many relationship between documents and groups
- `public_doc_groups` - Public document groups
- `cedar_documents` - CEDAR document integration

### Functions and Triggers
- `update_project_stats()` - Function for updating project statistics
- `project_stats_trigger` - Trigger on `llm-convo-monitor` table

### Indexes
- Performance indexes on key columns (course_name, user_email, created_at, etc.)

## How It Works

1. **ConfigMap Creation**: The schema SQL is stored in a ConfigMap
2. **Job Execution**: A Kubernetes Job runs after PostgreSQL is ready
3. **Schema Application**: The job applies the schema using `psql`
4. **Verification**: The job verifies successful schema creation

## Hook Configuration

The schema setup job uses Helm hooks:

```yaml
annotations:
  "helm.sh/hook": post-install,post-upgrade
  "helm.sh/hook-weight": "0"  # Run before other services
  "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
```

This ensures:
- The schema is created after PostgreSQL is installed
- The schema is updated on chart upgrades
- The job is cleaned up after successful completion
- The job runs before other application services start

## Troubleshooting

### Check Job Status
```bash
kubectl -n uiuc-chat get jobs
kubectl -n uiuc-chat describe job uiuc-chat-postgresql-schema-setup
```

### View Job Logs
```bash
kubectl -n uiuc-chat logs job/uiuc-chat-postgresql-schema-setup
```

### Manual Schema Application
If the automatic setup fails, you can manually apply the schema:

```bash
# Port forward to PostgreSQL
kubectl -n uiuc-chat port-forward svc/uiuc-chat-postgresql 5432:5432

# Apply schema
PGPASSWORD=password psql -h localhost -p 5432 -U postgres -d postgres -f /path/to/schema.sql
```

## Production Considerations

For production environments:

1. **Disable Automatic Setup**: Set `postgresql.schema.enabled: false`
2. **Use External Database**: Configure `externalDatabase` settings
3. **Manual Schema Management**: Apply schema changes through your database migration process
4. **Backup Before Changes**: Always backup before schema modifications

## Customization

To modify the schema:

1. Edit the `schema.sql` content in the ConfigMap
2. Update the Helm chart template
3. Redeploy the chart

The schema uses `CREATE TABLE IF NOT EXISTS` statements, so it's safe to run multiple times.

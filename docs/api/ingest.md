# Ingest API

Add documents to a project programmatically. Ingest is asynchronous: requests are queued and processed by the ingest worker, and each call returns a task ID.

## `POST /ingest`

### Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Project name. |
| `s3_paths` | array | one of* | S3 keys of files already uploaded to object storage. |
| `url` | string | one of* | A URL to ingest. |
| `readable_filename` | string | no | Human-readable name shown in the Materials page and citations. |
| `groups` | array | no | [Document groups](../guides/uploading-materials.md#organizing-with-document-groups) to assign. |

*At least one of `s3_paths` or `url` must be provided.

### Response

```json
{
  "outcome": "Queued Ingest task",
  "task_id": "…"
}
```

### Ingesting a file

File ingestion is a three-step flow — the file goes straight from your client to object storage, bypassing the application servers:

1. **Get a presigned upload URL** for your project (the Materials page upload flow generates these).
2. **`PUT` the file** to the presigned URL (no additional auth needed — the URL itself is the credential).
3. **Call `/ingest`** with the resulting S3 key:

```bash
curl -X POST https://backend.chat.illinois.edu/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "your-project-name",
    "s3_paths": ["courses/your-project-name/lecture-01.pdf"],
    "readable_filename": "Lecture 1 – Introduction.pdf",
    "groups": ["lectures"]
  }'
```

## Canvas ingest

```
POST /canvas_ingest
```

Bulk-import a Canvas course. Requires the platform's Canvas bot to have TA access to the course — see [Canvas Integration](../guides/canvas-integration.md).

### Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Project name. |
| `canvas_url` | string | yes | Canvas course URL, e.g. `https://canvas.illinois.edu/courses/12345`. |
| `files` | boolean | no | Import course files. Default `true`. |
| `pages` | boolean | no | Import pages. Default `true`. |
| `modules` | boolean | no | Import modules. Default `true`. |
| `syllabus` | boolean | no | Import the syllabus. Default `true`. |
| `assignments` | boolean | no | Import assignments. Default `true`. |
| `discussions` | boolean | no | Import discussions. Default `true`. |

### Example

```bash
curl -X POST https://backend.chat.illinois.edu/canvas_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "your-project-name",
    "canvas_url": "https://canvas.illinois.edu/courses/12345",
    "files": true,
    "pages": true,
    "modules": false,
    "syllabus": true,
    "assignments": false,
    "discussions": false
  }'
```

Each selected content type is queued as its own ingest job.

# Export API

Bulk-export conversation history and documents from a project. These endpoints are served by the Flask backend; the same exports are available in the UI — see [Bulk Export](../guides/bulk-export.md).

All export endpoints are `GET` requests sharing the same query parameters:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Project name. |
| `from_date` | string | no | Start of the date range (ISO 8601). |
| `to_date` | string | no | End of the date range (ISO 8601). |

And the same response behavior:

- **Small exports** — the file (a `.zip`) is returned directly as a download.
- **Large exports** — the export is staged in object storage and the response contains a link: `{"response": "Download from S3", "s3_path": "…"}`.
- **No data in range** — HTTP `204 No Content`.

## `GET /export-convo-history`

Export all conversations in the project as JSON Lines. See [Bulk Export](../guides/bulk-export.md#data-format) for the row format.

```bash
curl -o convos.zip "https://backend.chat.illinois.edu/export-convo-history?course_name=your-project-name&from_date=2026-01-01&to_date=2026-06-30"
```

Variants:

- `GET /export-convo-history-csv` — CSV-oriented export of the conversation history.
- `GET /export-convo-history-user` — export a single user's conversations.
- `GET /export-conversations-custom` — custom-filtered conversation export.

## `GET /exportDocuments`

Export the post-processed text and vector embeddings of all documents as JSON Lines.

```bash
curl -o documents.zip "https://backend.chat.illinois.edu/exportDocuments?course_name=your-project-name"
```

!!! note "Original files"
    To minimize data-transfer costs, exporting original files (PDFs, etc.) is only available for individual documents through the Materials page.

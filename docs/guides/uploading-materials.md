# Uploading Materials

Add documents to your project from the **Materials** page. Everything you add is chunked, embedded, and indexed automatically — see [Concepts → Documents](../concepts/documents.md) for what happens under the hood.

## Supported formats

| Category | Formats |
| --- | --- |
| Documents | PDF, DOCX, PPTX, XLSX, CSV, TXT, HTML |
| Code | Python, JSON, and other text-based source files |
| Media | MP4 (and other video), PNG, JPG/JPEG, SRT |

The per-file size limit is **500 MB**.

!!! info "Videos are transcribed"
    Videos are transcribed automatically with Whisper. Expect roughly 5–10 minutes of processing for an hour-long lecture; the transcript becomes searchable, citable content.

## Upload methods

### Drag and drop

Drag files onto the Materials page (or click **Upload**). Files are uploaded directly from your browser to object storage via presigned URLs, then queued for ingest.

### Web crawl

Enter a starting URL and let the crawler discover and ingest linked pages. See the dedicated [Web Crawling](web-crawling.md) guide.

### Canvas

Import files, pages, modules, syllabus, assignments, and discussions from a Canvas course. See [Canvas Integration](canvas-integration.md).

### PubMed

Import articles by PubMed ID or search query — handy for literature-review projects.

### GitHub

Provide a public repository URL to ingest its contents — great for project-onboarding assistants.

## Organizing with document groups

Group related documents (e.g. "Lectures", "Homework solutions", "Research papers"). Users can toggle groups on and off in chat settings to scope retrieval, and the [Retrieval API](../api/retrieval.md) accepts a `doc_groups` filter.

## Monitoring ingest

Each document on the Materials page shows its ingest status. Large files and crawls process asynchronously; failures are retried automatically with exponential backoff. Duplicate documents are detected by content and skipped — see [duplicate handling](../concepts/documents.md#duplicate-handling).

## Deleting documents

Deleting a document removes it from future retrieval. Citations that already appeared in past conversations remain visible.

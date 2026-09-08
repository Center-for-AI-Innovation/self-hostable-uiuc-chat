# Canvas Integration

Turn a Canvas course into an assistant in one step: Illinois Chat can bulk-import your course content directly from Canvas.

## What gets imported

- Files
- Pages
- Modules
- Syllabus
- Assignments
- Discussions

Everything imported goes through the standard [ingest pipeline](../concepts/documents.md#the-ingest-pipeline) and becomes citable content.

## Setting it up

1. Open your project's **Materials** page and choose **Connect Canvas**.
2. Invite the platform bot to your Canvas course **as a TA** so it can read the course content.

    !!! warning "Bot invitation required"
        The import cannot see your course until the bot account has TA access. On the legacy uiuc.chat instance the bot address was `uiuc.chat@ad.illinois.edu`; the current instance shows the address to invite during the connect flow.

3. Enter your Canvas course URL and select which content types to import.
4. Start the import. Content is queued and ingested asynchronously — watch progress on the Materials page.

[Watch the Canvas walkthrough :material-open-in-new:](../getting-started/video-walkthroughs.md#connect-canvas){ .md-button }

## Programmatic imports

Canvas ingestion is also available via the API — see [Ingest API](../api/ingest.md#canvas-ingest).

## Tips for teaching assistants

- Combine the Canvas import with [tutor mode](../getting-started/video-walkthroughs.md#set-up-tutor-mode) so the assistant guides students rather than giving away solutions.
- Use [document groups](uploading-materials.md#organizing-with-document-groups) to separate lecture materials from assignments.
- Check the [Analytics](analytics.md) page to see what students actually ask.

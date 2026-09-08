# API Reference

Illinois Chat exposes a public REST API so you can integrate your assistants into your own applications. All requests and responses are JSON over HTTPS.

## Base URL

```
https://chat.illinois.edu
```

For self-hosted deployments, substitute your own host. The chat endpoint is served by the Next.js frontend; retrieval, ingest, and export endpoints are served by the Flask backend (on self-hosted stacks these run on different ports — frontend `:3000`, backend `:8000`).

## Endpoint categories

| Category | What it does | Docs |
| --- | --- | --- |
| **Chat** | RAG-grounded, multi-turn conversations with streaming and image support | [Chat](chat.md) |
| **Retrieval** | Fetch relevant document contexts without invoking an LLM | [Retrieval](retrieval.md) |
| **Ingest** | Add files, URLs, or Canvas courses to a project programmatically | [Ingest](ingest.md) |
| **Export** | Bulk-export documents and conversation history | [Export](export.md) |

## Authentication

Requests are authenticated with a project **API key** passed in the JSON body (not a header), plus your own LLM provider key when a commercial model is used. See [Authentication](authentication.md).

## Streaming

Endpoints that support streaming (`"stream": true`) return newline-delimited chunks as the model generates them.

## Rate limits

No rate limits are currently published for the hosted instance. Be considerate; heavy programmatic workloads are better suited to a [self-hosted deployment](../self-hosting/index.md).

## Quick example

```bash
curl -X POST https://chat.illinois.edu/api/chat-api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Summarize the key topics in these documents."}],
    "course_name": "your-project-name",
    "api_key": "uc_YOUR_API_KEY",
    "openai_key": "sk-YOUR_PROVIDER_KEY",
    "temperature": 0.1,
    "stream": false
  }'
```

# Retrieval API

Fetch the most relevant document contexts for a query without generating an answer. These endpoints are served by the Flask backend.

!!! info "Retrieval via the Chat API"
    The [Chat API](chat.md) also supports a free `retrieval_only` mode if you're already integrating against it.

## `POST /getTopContexts`

Fast, single-query vector retrieval.

### Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `search_query` | string | yes | The query to match against the project's documents. |
| `course_name` | string | yes | Project name. |
| `token_limit` | integer | no | Token budget for the returned contexts. |
| `top_n` | integer | no | Maximum number of contexts to return. |
| `doc_groups` | array | no | Restrict retrieval to specific [document groups](../guides/uploading-materials.md#organizing-with-document-groups). |

### Example

```bash
curl -X POST https://backend.chat.illinois.edu/getTopContexts \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "What is a finite state machine?",
    "course_name": "ece-385",
    "doc_groups": ["lectures", "readings"],
    "top_n": 5
  }'
```

### Response

```json
[
  {
    "readable_filename": "Lumetta_notes",
    "pagenumber_or_timestamp": "pg. 19",
    "s3_pdf_path": "/courses/ece-385/Lumetta_notes.pdf",
    "text": "In FSM, we do this..."
  }
]
```

## `GET /getTopContextsWithMQR`

Multi-query retrieval with LLM filtering — higher precision at higher latency. See [Concepts → Retrieval](../concepts/retrieval.md#3-multi-query-retrieval-with-filtering).

### Query parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `search_query` | string | yes | The query. |
| `course_name` | string | yes | Project name. |
| `token_limit` | integer | no | Token budget for returned contexts, default `3000`. |

### Example

```bash
curl "https://backend.chat.illinois.edu/getTopContextsWithMQR?search_query=finite%20state%20machines&course_name=ece-385&token_limit=3000"
```

Returns the same context format as `/getTopContexts`.

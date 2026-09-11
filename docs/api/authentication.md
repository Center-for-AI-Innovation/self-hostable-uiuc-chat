# Authentication

API requests use up to two keys, both passed in the **JSON request body** (not headers).

## Project API key (`api_key`)

Identifies and authorizes access to your project.

- **Format:** `uc_` followed by 32 hex characters.
- **Where to get it:** open `https://chat.illinois.edu/<project-name>/api` (also reachable from the Materials page) and click **Generate API Key**. Only project **admins and owners** can access this page.
- **One key at a time:** each project has at most one active key. Rotate it with the **Rotate** button or delete it if needed. Rotating invalidates the previous key immediately.
- The UI shows pre-filled `curl` and language-specific snippets with your key already inserted.

!!! danger "Treat API keys as secrets"
    Anyone with your key can chat against your project (and spend your provider credits if you pass a provider key alongside it). Store keys in environment variables or a secrets manager, never in client-side code or version control.

## LLM provider key (`openai_key`)

When using a commercial model, supply your own provider key per request:

!!! info "Your provider key is never stored"
    Provider keys are passed through per-request for security and simplicity. That way you control costs and your key is never retained server-side.

The `openai_key` parameter is **optional** when using free NCSA-hosted models (e.g. `llama3.1:70b`) or `retrieval_only` requests.

## Errors

| Status | Meaning |
| --- | --- |
| `401 Unauthorized` | Invalid or missing `api_key`. |
| `403 Forbidden` | The key is valid but lacks permission for the requested project. |

## Example

```python
import os
import requests

response = requests.post(
    "https://chat.illinois.edu/api/chat-api/chat",
    json={
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "Hello!"}],
        "course_name": "your-project-name",
        "api_key": os.environ["ILLINOIS_CHAT_API_KEY"],
        "openai_key": os.environ["OPENAI_API_KEY"],
    },
)
```

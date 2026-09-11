# Chat API

The primary endpoint for developers: RAG-grounded chat over your project's documents, with streaming, multi-turn conversations, image input, and automatic tool use.

```
POST https://chat.illinois.edu/api/chat-api/chat
```

## Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | string | yes | Model to use, e.g. `gpt-4o-mini`, or a free NCSA-hosted model like `llama3.1:70b`. See [LLM Providers](../concepts/llm-providers.md). |
| `messages` | array | yes | OpenAI-style message list (`role`: `system` \| `user` \| `assistant`; `content`: string or content-part array for images). |
| `course_name` | string | yes | Your project name (the slug in your project URL). |
| `api_key` | string | yes | Project API key. See [Authentication](authentication.md). |
| `openai_key` | string | no* | Your LLM provider key. *Required for commercial models; omit for free NCSA-hosted models and `retrieval_only` requests.* |
| `temperature` | number | no | `0.0`–`1.0`, default `0.1`. |
| `stream` | boolean | no | Stream the response as newline-delimited chunks. Default `false`. |
| `retrieval_only` | boolean | no | Skip the LLM entirely and return only the retrieved contexts. Free of charge. Default `false`. |

## Response

Non-streaming responses include **both** the LLM answer and the retrieved contexts:

```json
{
  "message": "The documents cover ...",
  "contexts": [
    {
      "text": "…passage text…",
      "readable_filename": "Lecture 3 – State Machines.pdf",
      "course_name": "ece-385",
      "url": "",
      "pagenumber": "12"
    }
  ]
}
```

Streaming responses (`"stream": true`) return the answer text incrementally.

## Examples

=== "curl"

    ```bash
    curl -X POST https://chat.illinois.edu/api/chat-api/chat \
      -H "Content-Type: application/json" \
      -d '{
        "model": "gpt-4o-mini",
        "messages": [
          {"role": "system", "content": "Your system prompt here"},
          {"role": "user", "content": "What is in these documents?"}
        ],
        "openai_key": "sk-YOUR-PROVIDER-KEY",
        "temperature": 0.1,
        "course_name": "your-project-name",
        "stream": true,
        "api_key": "uc_YOUR_API_KEY"
      }'
    ```

=== "Python (streaming)"

    ```python
    import requests

    url = "https://chat.illinois.edu/api/chat-api/chat"
    data = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Your system prompt here"},
            {"role": "user", "content": "What is in these documents?"},
        ],
        "openai_key": "sk-YOUR-PROVIDER-KEY",
        "temperature": 0.1,
        "course_name": "your-project-name",
        "stream": True,
        "api_key": "uc_YOUR_API_KEY",
    }

    with requests.post(url, json=data, stream=True) as response:
        for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
            print(chunk, end="", flush=True)
    ```

=== "Python (non-streaming)"

    ```python
    import requests

    url = "https://chat.illinois.edu/api/chat-api/chat"
    data = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Your system prompt here"},
            {"role": "user", "content": "What is in these documents?"},
        ],
        "openai_key": "sk-YOUR-PROVIDER-KEY",
        "temperature": 0.1,
        "course_name": "your-project-name",
        "stream": False,
        "api_key": "uc_YOUR_API_KEY",
    }

    result = requests.post(url, json=data).json()
    print(result["message"])
    print(result["contexts"])
    ```

### Retrieval only

Return relevant contexts without invoking an LLM — free of charge:

```python
import requests

data = {
    "messages": [{"role": "user", "content": "What is in these documents?"}],
    "course_name": "your-project-name",
    "api_key": "uc_YOUR_API_KEY",
    "retrieval_only": True,
}
result = requests.post("https://chat.illinois.edu/api/chat-api/chat", json=data).json()
print(result["contexts"])
```

### Image input

Send images as part of a message using a vision-capable model:

```python
data = {
    "model": "gpt-4o",
    "messages": [
        {"role": "system", "content": "Your system prompt here"},
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": "https://example.com/image.png"}},
                {"type": "text", "text": "Give me more information on the action depicted in this image."},
            ],
        },
    ],
    "openai_key": "sk-YOUR-PROVIDER-KEY",
    "course_name": "your-project-name",
    "api_key": "uc_YOUR_API_KEY",
}
```

### Multi-turn conversations

Pass the full conversation history in `messages`, alternating `user` and `assistant` roles — exactly like the OpenAI chat format. Text and image parts can be mixed in the same conversation.

### Free NCSA-hosted models

```python
data = {
    "model": "llama3.1:70b",
    "messages": [{"role": "user", "content": "What is in these documents?"}],
    "temperature": 0.1,
    "course_name": "your-project-name",
    "stream": True,
    "api_key": "uc_YOUR_API_KEY",
    # no openai_key needed
}
```

!!! warning "Free vs. frontier models"
    NCSA-hosted open models are free but not the strongest performers. For superior instruction-following, response quality, and source citation, we recommend a frontier commercial model.

### Tool use

Tools enabled in your project are invoked automatically based on the LLM's judgment — there is no way to force invocation, but you can encourage it via prompting. A strong commercial model is always used for tool selection. See [Tools & Workflows](../guides/tools-workflows.md).

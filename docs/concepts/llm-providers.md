# LLM Providers

Illinois Chat is model-agnostic: each project chooses which large language models power it, and users can override the model per conversation.

## Supported providers

| Provider | Notes |
| --- | --- |
| **OpenAI** | GPT-4o family and newer; strong instruction-following and citation quality. |
| **Azure OpenAI** | OpenAI models via your Azure enterprise agreement. |
| **Anthropic** | Claude models. |
| **Google** | Gemini models. |
| **AWS Bedrock** | Models available through your AWS account. |
| **SambaNova** | Hosted open models. |
| **NCSA-hosted models** | Free open models (e.g. Llama family and Qwen) served on NCSA infrastructure — no API key required. |
| **Ollama** | Locally hosted open models, ideal for self-hosted deployments. |
| **WebLLM** | Runs entirely in the user's browser. |
| **OpenAI-compatible** | Any custom endpoint that speaks the OpenAI API (vLLM, etc.). |

!!! tip "Which model should I use?"
    Free NCSA-hosted models are a great zero-cost starting point. For the best instruction-following, response quality, and source citation, we recommend bringing your own key for a frontier commercial model.

## Bring your own key

For commercial providers you supply your own API key in the project settings. Keys are used only to serve your project's requests:

- Your data is **never used to train models** — provider interactions are contractually protected.
- For API access, provider keys are passed per-request and **never stored**. See [API Authentication](../api/authentication.md).

## Configuring models

- **Project default** — set the default model in your project's settings.
- **Per-conversation** — users can pick a different model from the model selector in the chat interface.
- **Via API** — pass the `model` parameter to the [Chat API](../api/chat.md).

**Temperature** controls creativity, from `0.0` (precise, deterministic) to `1.0` (creative). For technical question-answering the recommended default is `0.1`.

## Vision and tools

- **Image input** is supported on vision-capable models (e.g. GPT-4o, Claude).
- **Tool selection** always uses a strong commercial model regardless of your default, for reliable tool-argument generation. See [Tools & Workflows](../guides/tools-workflows.md).

## Embeddings

Retrieval quality also depends on the embedding model. The platform default is **Qwen3-Embedding-8B** (4096-dimensional vectors) served from any OpenAI-compatible endpoint — configurable in self-hosted deployments via `EMBEDDING_MODEL` and `EMBEDDING_API_BASE`. See [Environment Variables](../self-hosting/environment-variables.md).

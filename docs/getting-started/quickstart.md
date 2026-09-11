# Quickstart

Get from zero to a working, document-grounded assistant in about five minutes.

!!! success "TL;DR"
    Illinois Chat is the easiest way to *train your own LLM* and *share it like a Google Doc*.

## 1. Sign in and create a project

Go to [chat.illinois.edu](https://chat.illinois.edu) and sign in. Create a new **project** — a project is an assistant scoped to a topic, course, or team, with its own documents, settings, and access controls. See [Concepts → Projects](../concepts/projects.md).

## 2. Upload documents

Open the **Materials** page of your project and add content:

- **Drag and drop files** — PDF, Word, PowerPoint, Excel, CSV, text, HTML, code files, and even videos (transcribed automatically).
- **Crawl a website** — enter a starting URL and the built-in crawler ingests linked pages. See [Web Crawling](../guides/web-crawling.md).
- **Connect Canvas** — import course files, pages, and modules directly. See [Canvas Integration](../guides/canvas-integration.md).

Documents are automatically chunked, embedded, and indexed. See [Uploading Materials](../guides/uploading-materials.md) for supported formats and details.

## 3. Configure an LLM provider

For the best experience, bring your own API key (OpenAI, Anthropic, Azure OpenAI, and others are supported) in your project's settings. Free NCSA-hosted open models are also available with no key required. See [Concepts → LLM Providers](../concepts/llm-providers.md).

!!! info "Your keys are yours"
    Provider keys are used only to serve your project's requests. Your data is never used to train models.

## 4. Chat and review citations

Ask a question in the **Chat** tab. Your query is embedded, matched against your project's documents, and the most relevant passages are streamed to the LLM, which answers with citations. Expand the **Sources** section under an answer to see each cited passage with its filename, page number, and a link to the original document.

## 5. Customize the system prompt (optional)

Tailor your assistant's behavior on the **Prompting** page — for example, enable *tutor mode* so the assistant guides students toward answers instead of giving them away.

## 6. Share it

Every project has a permanent URL you can share. Control who gets access — private with an approved email list, or public to anyone with the link. See [Sharing & Access Control](../guides/sharing-access.md).

## 7. Integrate via API (optional)

Generate an API key on your project's API page and call the chat endpoint from your own applications:

```bash
curl -X POST https://chat.illinois.edu/api/chat-api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "What is in these documents?"}],
    "course_name": "your-project-name",
    "api_key": "uc_YOUR_API_KEY",
    "openai_key": "sk-YOUR_PROVIDER_KEY"
  }'
```

See the [API Reference](../api/index.md) for full details.

## Next steps

- [FAQs](faqs.md) — common questions about cost, support, and security.
- [Video walkthroughs](video-walkthroughs.md) — short screencasts of common workflows.
- [Self-hosting](../self-hosting/index.md) — run the entire platform on your own infrastructure.

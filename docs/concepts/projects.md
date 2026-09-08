# Projects

A **project** is the basic unit of organization in Illinois Chat: an assistant scoped to a topic, course, research group, or team.

Each project bundles together:

- **A knowledge base** — the documents and crawled web pages the assistant can draw on. Documents in one project are completely isolated from every other project; retrieval never crosses project boundaries.
- **Settings** — the default LLM, temperature, and system prompt used for conversations.
- **Access controls** — owners, admins, an approved user list, and a public/private toggle. See [Sharing & Access Control](../guides/sharing-access.md).
- **Tools** — optional custom tools the LLM can invoke during conversations. See [Tools & Workflows](../guides/tools-workflows.md).
- **An API key** — for programmatic access. See the [API Reference](../api/index.md).

## Project URL

Every project gets a permanent, shareable URL based on its name:

```
https://chat.illinois.edu/<project-name>
```

Project names must be unique across the instance and become part of the URL, so pick something short and recognizable (for example `ece-408` or `soil-science-lab`).

## Key pages within a project

| Page | Purpose |
| --- | --- |
| **Chat** | The conversation interface your users see. |
| **Materials** | Upload documents, start web crawls, organize document groups, export documents. |
| **Prompting** | Customize the system prompt (e.g. tutor mode). |
| **Tools** | Enable or disable custom tools. |
| **Analysis** | Usage analytics and conversation-history export. |
| **API** | Generate and rotate the project API key. |
| **Settings** | Default model, access control, and project administration. |

## Roles

| Role | Capabilities |
| --- | --- |
| **Owner** | Full control, including deleting the project. |
| **Admin** | Manage documents, settings, exports, and API keys — everything except deletion. |
| **Regular user** | Chat with the assistant. |

## Next steps

- [Documents](documents.md) — what happens to materials you add.
- [Retrieval](retrieval.md) — how answers get grounded in your documents.

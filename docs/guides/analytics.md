# Analytics

When you share your assistant as a learning tool, Illinois Chat shows you how people use it — helping you understand your audience's needs and improve your content.

## The Analysis page

Open **Analysis** in your project to see:

- **Usage over time** — conversation and message volume, including weekly trends.
- **Model usage** — which LLMs are being used and how often.
- **Conversation history** — browse what users are asking (owners and admins only).

Use it to spot gaps: questions that come up repeatedly with weak answers usually mean a document is missing from your knowledge base.

## Exporting conversations

The full conversation history — every user, every conversation — can be exported for offline analysis from the Analysis page. Only owners and admins can export. See [Bulk Export](bulk-export.md) for the data format.

## Semantic maps

Projects can generate **Nomic Atlas** semantic maps of documents and conversation history: an interactive 2-D visualization where similar items cluster together. This makes it easy to see, at a glance, the topics your users care about and how well your documents cover them. (Requires a Nomic API key on self-hosted deployments — see [Environment Variables](../self-hosting/environment-variables.md).)

## Privacy notes

- If a user is authenticated when chatting, their email is included in conversation logs; otherwise it is `null`.
- Only project owners and admins can access conversation history and exports.

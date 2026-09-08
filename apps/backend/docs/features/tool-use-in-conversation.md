---
description: >-
  To best answer your question, the LLM system uses tools as needed. Create your
  own tools with Sim AI.
---

# Tool use in conversation

You can create your own tools for the LLM to use seamlessly during a conversation. The LLM parses a user input and decides whether any of the available tools are relevant. If so, it generates the input parameters, the app invokes the tool, and the tool's output is sent back to the LLM to produce the final answer.

## Sim AI defines the tools

Tools are Sim AI workflows. Sim is a visual workflow builder that ships with the Illinois Chat stack and shares its Keycloak login, so any workflow you build and deploy in your Sim workspace can be exposed to a chatbot as a tool.

The full walkthrough, from signing in to Sim through connecting a workspace to a project, lives in [Sim AI: Signing In, Approval, and Project Tools](../../../../docs/sim-access-and-tools.md).

## Usage - Write your own tool

1. Build a workflow in Sim. Give it a clear name and description: the LLM uses both to decide when to call the tool.
2. Deploy the workflow. Only deployed workflows are discoverable.
3. In Illinois Chat, open `/<YOUR-PROJECT>/tools`, save your Sim API key and workspace, and enable the workflows you want active.
4. Start chatting. Tools are invoked as needed.

### Inputs

The workflow's declared inputs become the tool's parameters. Name and describe them so the LLM can fill them in correctly. Workflows with no inputs are advertised as taking no arguments.

### Outputs

The output of the workflow's final block is returned to the LLM. Arbitrary JSON is fine.

## Using images in tools

Images are passed as an array of `image_urls` in a JSON object. They must be URLs to images, not raw or binary data.

```json
{
   "image_urls": ["url", "url", "https://bucket.r2.cloudflare.com/img-path"],
   "other-useful-text": "These images depict the circle of life in the savanna."
}
```

* **Image inputs:** declare an `image_urls` input on the workflow.
* **Image outputs:** return a JSON object with a top-level `image_urls` key. You may return other fields alongside it; only `image_urls` is specially handled.

## Recommended patterns

Many tools are a single HTTP request block that calls a small HTTP endpoint you host, with the workflow's inputs passed through as the request body. This keeps the workflow simple and puts the logic in code you control.

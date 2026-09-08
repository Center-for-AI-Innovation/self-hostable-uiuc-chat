---
date: 2026-07-27
categories:
  - Announcements
authors:
  - caii
---

# Announcing the new Illinois Chat documentation

Welcome to the new home of the Illinois Chat documentation — built with Material for MkDocs, versioned alongside the code, and published automatically from the [monorepo](https://github.com/Center-for-AI-Innovation/Illinois-Chat).

<!-- more -->

## What's here

- **[Quickstart](../../getting-started/quickstart.md)** — from sign-in to a working, cited assistant in minutes.
- **[Concepts](../../concepts/projects.md)** — projects, documents, retrieval methods, and LLM providers.
- **[Guides](../../guides/uploading-materials.md)** — uploading materials, web crawling, sharing, custom tools, Canvas, analytics, and bulk export.
- **[API Reference](../../api/index.md)** — chat, retrieval, ingest, and export endpoints with runnable examples.
- **[Self-Hosting](../../self-hosting/index.md)** — the full Docker Compose stack, environment variables, and system architecture.
- **[CropWizard](../../cropwizard/index.md)** — the flagship agricultural assistant built on the platform.

## Release notes live here too

This blog is where we'll publish release announcements going forward. Subscribe by watching [releases on GitHub](https://github.com/Center-for-AI-Innovation/Illinois-Chat/releases), and check the **Releases** category here for details on what shipped.

## Contributing

Spotted something wrong or missing? Every page has an **edit** button that takes you straight to the source file on GitHub — pull requests are very welcome. Docs changes merged to `main` deploy automatically via GitHub Actions and GitHub Pages.

### How to write a release post

Add a file under `docs/blog/posts/` named `YYYY-MM-DD-short-slug.md`:

```markdown
---
date: 2026-08-15
categories:
  - Releases
authors:
  - caii
---

# vX.Y.Z — one-line summary

A paragraph summarizing the release.

<!-- more -->

## Highlights
- ...

## Breaking changes
- ...
```

Everything above the `<!-- more -->` marker appears in the blog index.

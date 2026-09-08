# Mantine Retirement — Handoff Document

_Last updated: 2026-07-17. Written as a handoff for whoever continues
[Illinois-Chat#45](https://github.com/Center-for-AI-Innovation/Illinois-Chat/issues/45)
(retire Mantine 6 → shadcn on Base UI)._

Companion docs in this folder:

- **`mantine-retirement-plan.md`** — the full per-file inventory and slicing plan
  (lives on PR [#70](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/70) → main).
- **`mantine-retirement-styles-notes.md`** — running log of the Tailwind written per
  migrated component + the **Elevation candidates** table (patterns to promote to the
  global Tailwind config).

---

## 1. Why we're doing this

Mantine 6 is EOL, emotion-based (`createStyles`/`sx`), and emits React-19 warnings
(`element.ref`). Upgrading to Mantine 7 was evaluated and rejected — it would be
throwaway work since the app already carries shadcn + Tailwind. Decision:
**retire Mantine entirely**, migrating to shadcn/ui components (now on **Base UI**
primitives) + Tailwind, organized **by page** so each PR is easy to review visually.

Two hard requirements for every slice (set by the team):

1. **Match the current production look 1:1** — production (chat.illinois.edu) is the
   pre-migration baseline; verify against it (see §5).
2. **Take notes on the styles you write** — append to
   `mantine-retirement-styles-notes.md` so repeated patterns get elevated to the
   global config at the end.

## 2. What has been done (the PR stack)

Merge order is bottom-up. Each PR stacks on the one above it:

| PR                                                                       | Branch                                      | What it does                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#39](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/39) | `chore/frontend-deps-wave-0-1` → main       | Dep waves 0+1: dead-dep removal (react-grid-heatmap, prisma, react-s3, keycloak-js, react-dropzone) + independent bumps                                                                                                                              |
| [#43](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/43) | `chore/frontend-deps-wave-2`                | Prettier 3 + typescript-eslint 8                                                                                                                                                                                                                     |
| [#44](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/44) | `chore/frontend-deps-wave-3`                | Next.js 15 (wave 3a)                                                                                                                                                                                                                                 |
| [#46](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/46) | `chore/frontend-deps-wave-3b`               | React 19.2 (wave 3b)                                                                                                                                                                                                                                 |
| [#47](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/47) | `chore/frontend-deps-wave-3c`               | Next.js 16 (wave 3c, pinned `--webpack` for the WASM config)                                                                                                                                                                                         |
| [#71](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/71) | `feat/mantine-shadcn-comparison` (on 3c)    | Mantine ↔ shadcn side-by-side comparison page (review aid)                                                                                                                                                                                           |
| [#72](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/72) | `feat/mantine-slice1-static-chrome` (on 3c) | **Slice 1**: navbar chrome (`AuthMenu`, `GlobalHeader`, `Navbar`) + static pages (`cropwizard-licenses`, `disclaimer`, `terms`, `privacy`) off Mantine. VR-verified vs production; includes the h2-2.2rem-Montserrat and nav-label `font-bold` fixes |
| [#73](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/73) | `chore/shadcn-base-ui` (on slice 1)         | **shadcn migrated Radix → Base UI** (`@base-ui/react@1.6`, style `base-vega`); all 26 `@radix-ui/*` deps removed; `asChild`→`render` in 9 app files; custom Button/Switch preserved; test suite updated (all green)                                  |
| [#74](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/74) | `feat/mantine-slice2-sonner` (on Base UI)   | **Slice 2 / Phase 0**: `toastUtils.ts` → **sonner**; shadcn `<Toaster>` mounted in `_app.tsx`; unit + real-Toaster integration tests                                                                                                                 |
| [#70](https://github.com/Center-for-AI-Innovation/Illinois-Chat/pull/70) | `docs/mantine-retirement-plan` → main       | The migration plan doc (independent of the stack; can merge anytime)                                                                                                                                                                                 |

Verification status on the top of the stack: `next build` green, **0 non-test tsc
errors**, migrated-component vitest suites green (shadcn/ui 13/13, chain-of-thought
37/37, ingest-form dialogs 7/7, toastUtils 3/3 unit + 2/2 integration), zero
`@radix-ui` imports, zero `@mantine` imports in migrated files.

## 3. What remains

Current footprint (measured 2026-07-17 on the top of the stack):
**77 files** import `@mantine`; **11 `@mantine/*` packages** in package.json;
**13 files** still call `notifications.show` directly.

In rough priority order:

1. **Notification-callers slice** (great next PR; mechanical). Convert the 13 direct
   `notifications.show` callers to `showToast` from `~/utils/toastUtils`
   (already sonner-backed): `Chat.tsx`, `GitHubIngestForm`, `WebsiteIngestForm`,
   `MakeNewCoursePage`, `ApiKeyManagament`, `N8NPage`, `MakeQueryAnalysisPage`,
   `PromptEditor`, `PromptEditorEmbed`, `LLMsApiKeyInputForm`, `ProjectFilesTable`,
   `WebScrape`, `N8nWorkflowsTable`, plus `newsletter-unsubscribe.tsx`. Then remove
   `<Notifications>` from `_app.tsx` and drop `@mantine/notifications`.
2. **`newsletter-unsubscribe.tsx`** — also needs `Title`/`Text`/`Group`/`Badge`
   migrated (deferred from slice 1; unblocked now that sonner exists).
3. **Home page `index.tsx`** — `Button`×5 / `Card`×4 / `Image`, gradient cards,
   polymorphic `Card component="a"`. Deferred from slice 1 for its own careful pass.
4. **Page clusters** (see the plan doc for the per-page import graph):
   - **Chat cluster** — `ChatNavbar`, `ChatInput`, `Chat.tsx`, sidebar, etc.
     (rendered on the `/chat` family; the biggest cluster).
   - **Dashboard/admin cluster** — `ProjectFilesTable`, `PromptEditor(+Embed)`,
     `UploadCard`, ingest forms, `LargeDropzone`, `WebScrape`, `Explore`,
     `ProjectTable`, `N8N*`, `MakeNewCoursePage`, api-inputs.
5. **Heavier Mantine subsystems** — each needs a mapped replacement (candidates in
   the plan doc): `@mantine/dropzone` (→ react-dropzone pattern or shadcn dropzone),
   `mantine-datatable` (→ `@tanstack/react-table`, already installed),
   `@mantine/tiptap` (PromptEditor), `@mantine/dates`, `@mantine/form`
   (→ react-hook-form, installed), `@mantine/modals`, `@mantine/spotlight`,
   `@mantine/nprogress`, `@mantine/hooks` (mostly 1-line local replacements —
   see `use-controllable-state.ts` for the pattern).
6. **Elevation pass** — promote the repeated patterns from
   `mantine-retirement-styles-notes.md` ("Elevation candidates") into
   `globals.css` `@layer components` / `tailwind.config.ts`: shine-on-hover,
   illinois-orange outline button, `.navbar-link`, Title scale
   (h1 3rem / h2 2.2rem / Montserrat 700 — the app THEME values, not Mantine defaults).
7. **Finale** — remove `MantineProvider` from `_app.tsx` **last**, then drop all
   `@mantine/*` + emotion deps, and delete the comparison page (#71).
8. **App-wide heading-weight audit** (side effect of Next 16, see §6 gotcha #2) —
   every `font-montserratHeading` element that isn't explicitly bold now renders
   lighter than production. Consider the root fix: make the heading font map to a
   700-only family again, or add explicit weights per site.
9. **Dep roadmap continuation** (separate from Mantine): wave 4 = React Compiler
   (remove hand-written useMemo/useCallback), wave 5 = Tailwind 4.
10. **Known debt (out of scope but documented)**: ~110 pre-existing tsc errors in
    test files (vitest `setTimeout` mock typings, `import.meta.glob`, backend/util
    tests). `next build` does not typecheck tests, so these don't block builds.
11. **Open checkbox on #73**: a human visual pass over the Base UI components
    (interactions are test-covered; nobody has eyeballed every page yet).

## 4. How to do a slice (the recipe that worked)

1. Branch off the top of the stack (currently `feat/mantine-slice2-sonner`).
   Work in a git worktree (`.claude/worktrees/...`) to keep main checkout clean.
2. Pick a page/cluster from the plan doc. Migrate its files: shadcn `ui/*`
   components (`@/components/shadcn/ui/<name>`) for interactive things
   (Button/Card/Table/Menu/Dialog/Switch/Tooltip…), native elements + Tailwind for
   `Text`/`Title`/`Flex`/`Group` layout.
3. **Match the look**: read the old `createStyles`/`sx`/props and translate exactly.
   - Mantine 6 token values: spacing xs=10px, sm=12px, md=16px, lg=20px;
     radius sm=4px.
   - **This app's theme overrides** (in `_app.tsx` MantineProvider — do NOT use
     Mantine library defaults): headings = `Montserrat` 700, h1 = 3rem,
     h2 = **2.2rem**; `theme.fn.largerThan/smallerThan('md')` → `md:`/`max-md:`.
   - Reuse every `--illinois-*`/`--navbar-*`/`--notification*`/`--dashboard-*` CSS
     var verbatim via arbitrary values (`bg-[var(--x)]`, `text-[--x]`).
4. **Append to the styles-notes doc**: what you wrote per component + anything that
   looks like an elevation candidate.
5. **Gate before PR** (all must pass):
   - `grep -rn "@mantine" <migrated files>` → zero
   - `npx tsc --noEmit` → non-test errors must stay at **0**
   - `npm run build` → green (also watch for Tailwind "ambiguous class" warnings —
     they mean a utility emitted NO css)
   - `npx prettier --write` + `npx eslint` on changed files
   - `npx vitest run <related tests>`
6. **Visual regression vs production** (see §5), fix mismatches, then PR stacked on
   the branch you started from, with a test plan in the body.

## 5. Visual-regression method (what actually caught bugs)

Production **chat.illinois.edu** is the ground-truth baseline (it still runs the
old Mantine build).

1. Serve your build locally: `npm run build && ./node_modules/.bin/next start -p 3210`.
   ⚠️ Use build+start — `next dev` rendering has been flaky inside git worktrees.
2. In a real browser, run `getComputedStyle` on the element in BOTH environments and
   diff font-family / size / weight / line-height / color / margins. Example probe:
   ```js
   const el = document.querySelector('h2')
   const cs = getComputedStyle(el)
   ;({
     f: cs.fontFamily,
     s: cs.fontSize,
     w: cs.fontWeight,
     lh: cs.lineHeight,
     c: cs.color,
   })
   ```
3. Screenshot side-by-side for the eyeball check, but trust the computed styles —
   two real bugs were caught this way (h2 size/font, nav-label weight) that
   screenshots alone made easy to misjudge.

Frontend-only local run (no backend needed for static pages/chrome):
`apps/frontend/.env.local` with just the Keycloak/PostHog placeholder vars —
auth fails soft to the signed-out state. For the full stack see `DEV_SETUP.md`
(`infra/scripts/start-dev.sh`; known issues: host port 5432 conflicts, a
`QDRANT_URL: unbound variable` bug at ~line 427 that skips Qdrant/MinIO seeding,
Keycloak realm `illinois_chat_realm`).

## 6. Gotchas (hard-won — read before touching anything)

1. **The app's Mantine theme ≠ Mantine defaults.** `_app.tsx` overrides headings to
   Montserrat with h2=2.2rem (35.2px), h1=3rem. Slice 1 originally used the library
   default (h2=1.625rem) and shipped a visual regression until VR caught it.
2. **Next 16 `next/font` weight change.** `montserrat_heading` (700) and
   `montserrat_paragraph` (500) now share the family name `Montserrat` with both
   faces loaded, so `font-montserratHeading` no longer forces bold — the element's
   own `font-weight` picks the face. Production's older build had a 700-only heading
   family, so text with CSS `font-weight:500` still LOOKED bold. Any heading-font
   element that isn't explicitly `font-bold` now renders lighter than prod.
3. **Base UI ≠ Radix API.** No `asChild` — use `render={<El/>}` on triggers.
   Accordion: `openMultiple` boolean, array `value`/`defaultValue`, no
   `collapsible`/`type`. Tooltip requires `<TooltipProvider>`. State attrs are
   `data-checked`/`data-unchecked`/`data-open` (not `data-[state=…]`).
   `MenuGroupLabel` must sit inside a `Menu.Group`.
4. **`npx shadcn add --overwrite` CLOBBERS local customizations.** It replaced our
   custom Button (danger/dashboard variants) and Switch (labels/tooltip/sizes)
   with vanilla versions, and silently bumped shared deps (recharts 2→3 broke
   charts; pinned back to `^2.15.4`). Always diff regenerated files against the
   previous versions and re-apply customizations.
5. **`npm install --legacy-peer-deps` prunes auto-installed peers.** It removed
   `@testing-library/dom` → ~200 phantom "no exported member `screen`" errors.
   Peers this repo relies on must be declared explicitly in package.json.
   (React 19 currently forces `--legacy-peer-deps` for most npm operations here.)
   Related: when npm won't persist a change under peer conflicts, edit package.json
   directly and run `npm install --legacy-peer-deps` to reconcile.
6. **Tailwind ambiguity with tailwindcss-animate**: `after:duration-[650ms]` is
   ambiguous and emits NO css. Use explicit properties, e.g.
   `after:[transition:transform_650ms]`. Watch build output for "ambiguous" warnings.
7. **`next build` does not typecheck test files** — a green build can hide test-file
   tsc errors. Check source errors separately:
   `npx tsc --noEmit | grep -v __tests__ | grep -v ".test."`. The pre-existing
   test-file baseline is ~110 errors.
8. **`gh pr edit` fails on this org** (deprecated Projects-classic GraphQL). Update
   PR bodies via `gh api repos/<org>/<repo>/pulls/<n> -X PATCH -F body=@file.md`.
9. **Node 22 required**; login shells default to Node 16. Prefix commands with
   `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"`.
10. **Package name**: Base UI is **`@base-ui/react`** (1.6+, stable). The old
    `@base-ui-components/react` (1.0.0-rc) is its pre-rename package — don't
    install that one. The shadcn CLI does not auto-install either.

## 7. Key files

| File                                                                | Role                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/frontend/docs/mantine-retirement-plan.md`                     | per-file inventory + slicing plan (PR #70)                                                       |
| `apps/frontend/docs/mantine-retirement-styles-notes.md`             | per-component style log + elevation candidates                                                   |
| `apps/frontend/components.json`                                     | shadcn config — `style: "base-vega"` selects Base UI                                             |
| `apps/frontend/src/components/shadcn/ui/`                           | the shadcn components (Base UI primitives)                                                       |
| `apps/frontend/src/components/shadcn/ui/button.tsx`, `switch.tsx`   | CUSTOMIZED — do not `--overwrite` without re-applying                                            |
| `apps/frontend/src/components/shadcn/lib/use-controllable-state.ts` | local replacement for the Radix hook                                                             |
| `apps/frontend/src/utils/toastUtils.ts`                             | sonner-backed toast helper (the notification choke point)                                        |
| `apps/frontend/src/pages/_app.tsx`                                  | `<Toaster>` mounted; Mantine `<Notifications>` + `MantineProvider` still live here until the end |
| `apps/frontend/fonts.ts`                                            | `montserrat_heading` (700) / `montserrat_paragraph` (500) next/font definitions                  |

# Mantine retirement — styles notes

Running log of the Tailwind/CSS written while replacing Mantine components, so we can spot repeated patterns and decide what to **elevate** to the global Tailwind config (`tailwind.config.ts`) or a shared `@layer components` in `globals.css`. All existing `--illinois-*` / `--navbar-*` / `--foreground*` CSS variables are reused verbatim, so colors match 1:1 across the migration.

## Elevation candidates (review before Phase 3)

| Pattern                                                                                                                                                        | Where it appears                                         | Suggested home                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Shine sweep on hover** (diagonal white gradient swept via `::after`, 650ms)                                                                                  | `AuthMenu` avatar                                        | `@layer components { .shine-on-hover { … } }` in globals.css, or a Tailwind plugin utility |
| **Illinois-orange outline button** (`h-9 min-w-[100px] border border-[--illinois-orange] text-[--illinois-orange] hover:bg-[rgb(255_95_5_/_0.05)]`)            | `AuthMenu` sign-in, `GlobalHeader` nav links + menu icon | shared `<Button variant="illinoisOutline">` or a `.btn-illinois-outline` component class   |
| **Navbar link** (`text-[13px] font-medium text-[--navbar-foreground] hover:text-[--navbar-hover] hover:bg-[--navbar-hover-background] data-[active=true]:...`) | `Navbar` desktop + mobile links                          | `.navbar-link` component class                                                             |
| **montserratHeading font** (`${montserrat_heading.variable} font-montserratHeading`)                                                                           | everywhere in chrome                                     | already a shared pattern; consider a `<Heading>`/`font-heading` utility                    |

## Per-component log

### Slice 1 — navbar chrome + static pages (2026-07-01)

> ⚠️ **Next 16 `next/font` weight gotcha (found via VR against production).** Under Next 16, `montserrat_heading` (700) and `montserrat_paragraph` (500) both resolve to family **`Montserrat`** with _both_ faces loaded — so `font-montserratHeading` no longer forces bold; the element's own `font-weight` now selects the face. Production (older Next) had a **700-only** `__Montserrat_*` heading family, so nav labels (whose CSS is `font-weight:500`, confirmed in the original `GlobalHeader` `link` createStyles) rendered at **700 anyway**. Net effect: any `font-montserratHeading` element with a non-700 weight renders **lighter** than production. Slice-1 nav buttons (`orangeOutlineBtn`, `navLinkClass`, AuthMenu sign-in) were `font-medium` → now **`font-bold`** so they render Montserrat 700 like production. **This is a Next-16 (wave-3c) side effect that affects heading text app-wide — audit heading weights against prod in every later slice.**

**AuthMenu.tsx** — `Menu`→`DropdownMenu`, `Avatar`(gradient)→shadcn `Avatar`/`AvatarFallback`.

- Gradient fill: `bg-[linear-gradient(135deg,var(--illinois-industrial),var(--illinois-blue))]` on `AvatarFallback`.
- **Shine sweep (ELEVATE):** `relative overflow-hidden after:absolute after:inset-0 after:content-[''] after:-translate-x-full after:bg-[linear-gradient(120deg,transparent_0%,transparent_30%,rgba(255,255,255,0.2)_50%,transparent_70%,transparent_100%)] after:[transition:transform_650ms] hover:after:translate-x-full` (use the explicit `[transition:…]` shorthand, not `after:duration-[650ms]` — the latter is ambiguous with tailwindcss-animate and emits no CSS) + `hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]`. → candidate `.shine-on-hover`.
- Dropdown: `rounded-xl border border-[--border] bg-[--background] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.2)]`; items `rounded-lg px-4 py-2.5 text-sm font-medium text-[--foreground] focus:bg-[--muted]`.
- **Sign-in button = orange-outline button (ELEVATE):** `h-[2.2rem] min-w-[100px] rounded-md border border-[--illinois-orange] px-3 text-sm font-medium text-[--illinois-orange] hover:bg-[rgb(255_95_5_/_0.05)]`.

**GlobalHeader.tsx** — dropped `createStyles`; hoisted two Tailwind consts:

- `orangeOutlineBtn` (same orange-outline button as AuthMenu sign-in; adds `focus:outline focus:outline-2 focus:outline-[--dashboard-button]`, `bg-white`) — used for nav links.
- `orangeIconBtn` — square `h-[2.2rem] w-[2.2rem] p-1` variant for the hamburger.
- Both duplicate AuthMenu's sign-in style → **ELEVATE to one shared button/variant.**
- The mobile-dropdown `<style jsx>` (menuSlideDown/Up, .menu-item, pulse) is NOT Mantine — left as-is.

**Navbar.tsx** — `Flex`→div, `Burger`→`IconMenu2`/`IconX` toggle button, `Transition`+`Paper`→conditional render w/ `animate-in fade-in-0 zoom-in-95 origin-top-right duration-200`, `useDisclosure`→`useState`.

- **`navLinkClass` (ELEVATE `.navbar-link`):** `flex items-center justify-center gap-[0.4rem] rounded px-3 py-2.5 text-[13px] font-medium text-[--navbar-foreground] hover:bg-[--navbar-hover-background] hover:text-[--navbar-hover] data-[active=true]:bg-[--navbar-background] data-[active=true]:text-[--navbar-active]` + mobile `max-md:*` overrides. Mantine tokens resolved: spacing.xs=10px→py-2.5, spacing.sm=12px→px-3, spacing.lg=20px→py-5, radius.sm=4px→rounded.
- Mobile dropdown: `absolute right-2 top-16 z-[2] w-[calc(100%-1rem)] max-w-[330px] rounded-[10px] border border-[--navbar-border] bg-[--background-faded] shadow-lg lg:hidden`.

**cropwizard-licenses.tsx** — `Title order={2}`→`<h2 className="${montserrat_heading.variable} font-montserratHeading text-[2.2rem] font-bold leading-[1.35]">`, `Flex`→`flex min-h-[50px] flex-col flex-wrap items-start justify-start gap-4` (gap="md"=16px), `Text`→`<p>`, `List`/`List.Item`→`<ul className="list-disc pl-10">`/`<li>`.

> ⚠️ **CRITICAL — Title uses the app's THEME override, not Mantine defaults.** `apps/frontend/src/pages/_app.tsx` `MantineProvider.theme.headings` sets `fontFamily: 'Montserrat, Roboto, sans-serif'` and `sizes: { h1: 2.125rem→**3rem**, h2: 30px→**2.2rem** }`. So `<Title order={2}>` renders at **35.2px (2.2rem) in Montserrat 700, line-height 1.35 (→47.52px)** — NOT the 1.625rem/26px library default. Verified 1:1 against chat.illinois.edu computed styles. **Any `<Title>`→`<h2>` migration must apply `font-montserratHeading` + the theme size, and be diffed against production.** ELEVATE a `<Heading>` component / `.title-*` scale: h1 3rem, h2 2.2rem, both Montserrat 700 lh 1.35 (h3+ still Mantine defaults — measure before migrating).

**disclaimer / terms / privacy** — removed dead/unused `@mantine/core` import lines only (no rendered Mantine).

**Deferred from slice 1:** `index.tsx` (home — `Button`×5/`Card`×4/`Image`, gradient + polymorphic `component="a"`; own careful pass) and `newsletter-unsubscribe.tsx` (uses `notifications.show` directly → needs the sonner foundation).

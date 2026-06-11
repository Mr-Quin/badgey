# Testing

This project uses two layers of automated tests:

- **Unit tests** — [Vitest](https://vitest.dev) with the `jsdom` environment.
- **End-to-end tests** — [Playwright](https://playwright.dev) driving Chromium, organized with the Page Object Model (POM).

## Commands

| Script                    | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `bun run test:unit`       | Run unit tests once (`vitest run`).                                        |
| `bun run test:unit:watch` | Run unit tests in watch mode.                                              |
| `bun run test:e2e`        | Run Playwright e2e tests. Boots a Vite server in `fake` mode on port 5174. |
| `bun run dev:fake`        | Run the dev server in `fake` transport mode.                               |

## Layout

```
tests/
  unit/                 # *.test.ts — Vitest
  e2e/
    pages/              # Page Object Model classes (one per component/page)
    specs/              # *.spec.ts — Playwright specs
```

## testid naming conventions

Interactive and asserted-on elements expose a stable `data-testid` attribute so tests
do not depend on copy, layout, or CSS.

- **kebab-case** — e.g. `app-root`, `connect-button`, `badge-name-input`.
- **One testid per interactive element** — every button, input, toggle, or other
  element a test interacts with or asserts on gets its own unique testid.
- **Stable, semantic names** — name by role/purpose, not by visual styling.
- Tests select via `page.getByTestId(...)` (Playwright) — never by text or CSS class.

## Page Object Model (POM)

- **One POM class per component/page.** Each class wraps the locators and actions for
  that component, keeping selectors out of the specs.
- `BasePage` (`tests/e2e/pages/base-page.ts`) provides shared helpers:
  - `testid(id)` → `page.getByTestId(id)`
  - `goto()` → navigates to the app root (`/`).
- Component POMs extend `BasePage` and expose intent-revealing methods
  (e.g. `await connectPage.clickConnect()`), so specs read as user flows.

## Browser-only code

Helpers that rely on browser-only APIs (`createImageBitmap`, `OffscreenCanvas`,
`convertToBlob`) — e.g. `src/lib/editor.ts` — can't run under jsdom, so their pure
geometry is unit-tested and the canvas path is **covered by e2e tests** (real Chromium).

## FakeBadge / transport modes

The app selects its Bluetooth transport at build/runtime via the `VITE_TRANSPORT`
environment variable:

- `VITE_TRANSPORT=fake` — uses the in-memory **FakeBadge** transport, so tests run
  without real Web Bluetooth hardware or browser permission prompts.
- Unset / other — uses the real Web Bluetooth transport.

Fake mode is wired through Vite's `--mode fake`, which loads `.env.fake`
(`VITE_TRANSPORT=fake`). The Playwright `webServer` boots `vite --mode fake`, and
`bun run dev:fake` does the same for local development.

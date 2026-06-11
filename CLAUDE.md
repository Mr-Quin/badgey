# Notes for agents

Badgey is a browser app that puts images on a Bluetooth "pin badge" over the Web Bluetooth API.

## Commands

```sh
bun run dev        # real badge over Web Bluetooth
bun run dev:fake   # in-memory simulator (no hardware) — use this for UI work
bun run check      # oxlint + oxfmt + svelte-check + tsgo — keep at 0 errors / 0 warnings
bun run test:unit  # vitest
bun run test:e2e   # Playwright (runs against the simulator)
bun run knip       # unused files / exports / deps
bun run build
```

Run `bun run check` and the tests before claiming anything works.

## Architecture

- **`src/lib/` holds all business logic and has ZERO UI-framework imports — keep it that way.** This is what makes the UI swappable.
  - `observable.ts` — tiny store implementing Svelte's store contract, so `$store` works in components without importing `svelte/store`. Stores in `src/lib/stores/` use it.
  - `stores/badge.ts` — connection lifecycle (connect / upload / delete / heartbeat / disconnect) and app state.
  - `editor-session.ts` — `EditorSession` controller owns the editor state and lifecycle for images and video clips (transform, clip trim/playback, autosave, size estimate, send, restore).
  - `editor.ts` — pure crop geometry; `history.ts` — IndexedDB drafts/uploads.
  - `video/` — clip pipeline, all browser-native (no ffmpeg): `probe.ts` (detect/measure), `frames.ts` (extract frames via `<video>` seek or `ImageDecoder`), `clip.ts` (trim/budget math), `avi.ts` (MJPEG-AVI muxer), `encode.ts` (orchestrates frames -> jpeg -> avi). Clips upload through the same path as images.
  - `badge/` — the BLE protocol core behind a `BleTransport` interface, with two implementations: `webbluetooth.ts` (real) and `fake-badge.ts` (the simulator used by `dev:fake` and e2e). **Treat this as a working black box. Do not document the wire format or add byte-level protocol comments here.**
- **`src/components/` are thin Svelte views over the above.** Reuse the primitives (`Button`, `BadgeMark`) instead of hand-rolling styles.
- **Styling** uses the Sakura design tokens in `src/sakura.css` (`--p-*` CSS vars) plus scoped component CSS. No Tailwind.

## Conventions

- Keep this repo a clean "just an app" surface: **no reverse-engineering, protocol, or provenance details** in docs or comments.
- e2e relies on stable `data-testid`s (`connect-button`, `upload-button`, `image-input`, `image-preview`, `free-space`, `file-row`, `file-delete`, `file-delete-confirm`, `refresh-button`, `connection-status`, `upload-progress`, `upload-success`, `size-estimate`, `history-item`, `history-restore`, `media-type`, `video-timeline`, `fps-chip`, `frame-budget`, `play-toggle`). Preserve/extend them. `connection-status` and `free-space` are visually-hidden hooks behind the real UI.
- Tests run against `FakeBadge` (`VITE_TRANSPORT=fake`); keep them deterministic and lean.
- UI copy: plain and terse, no em dashes.

## Gotchas

- Web Bluetooth is **Chromium-only** (Chrome/Edge desktop, Chrome on Android) over **HTTPS or `localhost`**; Linux needs the `chrome://flags/#enable-experimental-web-platform-features` flag.
- The device reports **free space only**, never a total.
- The simulator can't prove a real BLE round-trip — changes near `badge/` warrant a real-hardware check.

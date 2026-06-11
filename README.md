<p align="center">
  <img src="public/favicon.svg" width="84" height="84" alt="Badgey logo" />
</p>

<h1 align="center">Badgey</h1>

<p align="center">Web app to put images on your digital pin badge.</p>

## Features

- Image editing: reposition, zoom, rotate, and crop against a round preview that matches the badge.
- Video clips: drop an MP4, MOV, WebM, or GIF and the editor switches to clip mode with a trim timeline, frame-rate presets, in-app playback, a frame-budget meter, and "grab a frame as a still". The framing tools apply per frame.
- Quality: uploads keep their detail instead of being heavily recompressed.
- Persistence: uploads and in-progress drafts are saved in the browser, so you can reopen and re-edit them.

Video is decoded natively by the browser, so MP4, MOV, WebM, and GIF work, but MKV, AVI, and exotic codecs do not.

## Compatibility

It talks to the badge over Web Bluetooth, so it only runs in Chromium browsers.

| Platform                | Works? |
| ----------------------- | :----: |
| Chrome / Edge (desktop) |   ✅   |
| Chrome on Android       |   ✅   |
| Firefox                 |   ❌   |
| Safari                  |   ❌   |
| iPhone / iPad           |   ❌   |

On Linux, enable `chrome://flags/#enable-experimental-web-platform-features`, relaunch, and keep the system Bluetooth service running.

## Supported badges

🔌 Works with any badge that uses the **ZRun** app.

## Development

```sh
bun install

bun run dev        # connect to a real badge over Web Bluetooth
bun run dev:fake   # in-memory simulator, no hardware needed

bun run check      # lint + format + type check
bun run test:unit  # vitest
bun run test:e2e   # playwright
bun run build      # production build
```

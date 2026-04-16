# Subtitle Masker

A lightweight browser extension that hides hardcoded subtitles with a draggable, resizable mask.

Built for listening-focused video watching: when subtitles are always on screen, it is too easy to read instead of actually listening. Subtitle Masker helps you rely more on audio, scene context, and real comprehension.

## Features

- Draggable subtitle mask
- Resizable from the corners
- Adjustable opacity
- Per-site saved position and size
- Keyboard shortcut: `Alt+S`
- Works on many video sites without site-specific setup
- Site-specific fullscreen handling when needed

## How to use

1. Open a video page.
2. Click the extension icon and enable the mask.
3. Drag the mask to the subtitle area.
4. Resize it from the corners if needed.
5. Adjust opacity from the popup.
6. Double-click the mask to reset its default position.

## Fullscreen behavior

There are two kinds of fullscreen on the web:

1. **Native video fullscreen**
   - Triggered by the browser/player's built-in video control
   - Usually fills the screen perfectly
   - But normal web page overlays often cannot appear above it

2. **Container fullscreen**
   - Triggered by the page or extension on a normal DOM container
   - Lets the subtitle mask stay visible
   - Some sites may use a custom fullscreen button for this reason

Because of browser limitations, some sites may need the extension's custom fullscreen path to keep the mask visible.

## Known limitations

- Native video fullscreen may hide the subtitle mask on some sites.
- Video players behave differently across websites, so fullscreen behavior is not identical everywhere.
- Some sites may show a custom fullscreen button added by the extension to keep the mask visible.

## Privacy

Subtitle Masker runs locally in your browser.

- No account
- No analytics
- No video data upload
- No subtitle data upload

The extension only stores local settings such as mask position, size, and opacity.

## Installation (developer mode)

1. Open your Chromium-based browser extension page.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Permissions

- `storage`: save opacity and mask position
- site access: inject the mask into video pages
- `scripting` / `webNavigation`: keep the content script working on dynamic video pages and frames

## Why broad site access is needed

Subtitle Masker needs to run directly on video pages in order to place the mask over the visible subtitle area.

Different sites use very different player structures:
- some use normal inline video elements
- some use custom fullscreen containers
- some render video inside frames or dynamic page transitions

Because of that, the extension requests broad site access so it can inject the local mask UI where needed.

It does **not** upload browsing history, video data, subtitle data, or page content to any remote server.

## Release notes

### v0.1.0

- Initial public release
- Draggable and resizable subtitle mask
- Opacity control and keyboard shortcut
- Site-specific fullscreen handling improvements for tricky players

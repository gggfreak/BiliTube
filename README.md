# BiliTube

简体中文说明: [README.zh-CN.md](./README.zh-CN.md)

A lightweight browser extension that enhances your Bilibili playback experience and hides hardcoded subtitles with a draggable mask.

BiliTube offers two main core features:

1. **Bilibili Playback Enhancements**: Brings YouTube-like smooth controls to Bilibili (e.g., long-press mouse or Spacebar for 2x speed).
2. **Subtitle Masking**: Built for listening-focused video watching. When subtitles are always on screen, it is too easy to read instead of actually listening. BiliTube places a resizable mask over them so you rely more on audio and context.

## Quick start

1. Install BiliTube from the [Chrome Web Store](https://chromewebstore.google.com/detail/bilitube/pmgdfclndepngncnacmegcfplgdecmgh).
2. Open a video page, click the extension icon, and enable the features.

Normal limitations:
- some sites may behave differently in fullscreen
- some players may need manual repositioning of the mask

## Features

- Draggable subtitle mask
- Resizable from the corners
- Adjustable opacity
- Per-site saved position and size
- **Bilibili & Douyin Enhancements**:
  - **Long-press speedup**: Hold left mouse button or Spacebar for 2x speed playback on Bilibili and Douyin.
  - **Smart distinction**: Short clicks still trigger the native play/pause.
  - **Visual indicator**: Displays a sleek "2x ⏩" pill-shaped indicator while speeding up.
  - **YouTube-style shortcuts**:
    - `k`: Play/pause
    - `j` / `l`: Rewind / Fast-forward 10 seconds
    - `0`..`9`: Jump to 0%..90% of the video length
    - `Shift` + `p` / `n`: Previous / Next video
    - `f` / `t` / `i`: Toggle Fullscreen / Web Fullscreen / Picture-in-Picture
    - `m`: Toggle Mute
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

BiliTube runs locally in your browser.

- No account
- No analytics
- No video data upload
- No subtitle data upload

The extension only stores local settings such as mask position, size, and opacity.

## Installation

**Recommended**: Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/bilitube/pmgdfclndepngncnacmegcfplgdecmgh).

*(For developers: You can also clone this repository, turn on **Developer mode** in your browser's extensions page, and choose **Load unpacked** to load this folder.)*

## Permissions

- `storage`: save opacity and mask position
- `activeTab`: grant temporary access to the current site when you click the extension icon or use a shortcut. This is a secure way to enable the subtitle mask on any site without granting permanent access.
- `scripting`: inject the mask UI and playback enhancement code into video pages.
- `host_permissions` for `bilibili.com` and `douyin.com`: allow playback enhancements to load automatically on specific sites.

## Why `activeTab` is used instead of broad site access

To respect user privacy and security, BiliTube uses the `activeTab` permission. This means the extension has no access to any website until you explicitly activate it by clicking its icon or using a keyboard shortcut.

When activated, it gains temporary permission to inject the subtitle mask into the current page. This model provides the flexibility to work on any video site while being much more secure than requesting permanent access to all websites.

For Bilibili and Douyin, specific host permissions are requested to allow the playback enhancement features to load automatically for the best user experience.

It does **not** upload browsing history, video data, subtitle data, or page content to any remote server.

## Security philosophy

BiliTube is intended to stay a local, single-purpose tool.

Its goal is simple: place a mask over visible subtitle areas on video pages.

### Non-goals

- no account system
- no analytics or tracking
- no cloud sync
- no remote code or remote rule execution
- no collection or upload of page content, subtitles, or browsing history

## Release notes

### v0.1.0

- Initial public release
- Draggable and resizable subtitle mask
- Opacity control and keyboard shortcut
- Site-specific fullscreen handling improvements for tricky players

<!--
 * @Date: 2026-04-16 11:10:51
 * @LastEditors: gggfrank
 * @LastEditTime: 2026-04-30 14:11:55
 * @FilePath: /subtitle-masker/CHANGELOG.md
-->
# Changelog

## 1.0.15 (Current)

- **Compliance**: Removed unused `webNavigation` permission to comply with Chrome Web Store policies. This does not affect any existing functionality.

## 1.0.14

- **Security**: Improved extension security and privacy by replacing the broad `<all_urls>` host permission with the `activeTab` permission. The extension now only gains access to a site when the user explicitly clicks the extension icon or uses a shortcut. A specific host permission for `bilibili.com` is retained for automatic feature loading.

## 1.0.13

- **UI**: Removed the default keyboard shortcut hint (`Alt+M` / `Ctrl+M`) from the popup UI and READMEs to prevent user confusion, as macOS frequently overrides these combinations. Custom shortcut binding is still supported.

## 1.0.12

- **Fix**: Resolved an issue where releasing the long-press mouse button wouldn't restore original playback speed due to conflicts with Bilibili's native long-press state. Replaced `pointerup` event blocking with a 200ms `video.pause()` hijack for a flawless experience.

## 1.0.11

- **Remove**: Removed unstable shortcuts (CC toggle, speed adjustment via `<`, `>`, and frame stepping `,`, `.`) due to compatibility issues with various Bilibili player versions.

## 1.0.10

- **Fix**: Bilibili playback enhancements (like long-press for speed) now activate immediately on page load, without needing to first toggle the subtitle mask. The content script is now automatically injected into Bilibili pages.

## 1.0.9

- **Fix**: Improved the long-press speed-up feature on Bilibili to prevent the video from pausing upon mouse release. The fix involves more robust event handling to avoid conflicts with the player's native controls.

## 1.0.0

- Initial public release
- Added draggable and resizable subtitle mask
- Added opacity control in popup
- Added keyboard shortcut (`Alt+M` / `Control+M`)
- Added per-site saved mask position and size
- Added Bilibili playback enhancements (YouTube-like experience)
  - Long-press mouse left click or Spacebar for 2x speed playback
  - Added visual pill-shaped indicator for playback speed changes
  - Supported extensive YouTube-style keyboard shortcuts (k, j, l, f, t, i, etc.)
- Improved fullscreen handling for difficult video players
- Added site-specific handling for pages where native fullscreen hides normal DOM overlays

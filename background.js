/*
 * @Date: 2026-04-16 11:10:51
 * @LastEditors: gggfrank
 * @LastEditTime: 2026-04-29 17:49:54
 * @FilePath: /subtitle-masker/background.js
 */

async function injectAndToggle(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => !!window.__subtitleMaskerLoaded
    });
    if (results[0]?.result) {
      return await chrome.tabs.sendMessage(tabId, { action: 'toggle' }).catch(() => {});
    }
  } catch (e) {}

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content.js']
  });
  await chrome.tabs.sendMessage(tabId, { action: 'toggle' }).catch(() => {});
}

// Keyboard shortcut: Alt+S
chrome.commands.onCommand.addListener(async (command, tab) => {
  console.log(`[UniTube] Command received: '${command}' on tab ${tab.id}`);
  if (command === 'toggle-mask') {
    await injectAndToggle(tab.id);
  }
});

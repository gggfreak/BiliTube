// Inject content.js into every sub-frame as it loads
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) return; // skip top frame (handled by content_scripts)
  chrome.scripting.executeScript({
    target: { tabId: details.tabId, frameIds: [details.frameId] },
    files: ['content.js']
  }).catch(() => {});
});

async function injectAndToggle(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => {
        if (window.__subtitleMasker) {
          window.__subtitleMasker.toggle();
          return true;
        }
        return false;
      }
    });
    if (results[0]?.result) return;
  } catch (e) {}

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content.js']
  });
}

// Keyboard shortcut: Alt+S
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-mask') {
    await injectAndToggle(tab.id);
  }
});

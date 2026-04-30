const toggleEl = document.getElementById('toggle');
const opacityEl = document.getElementById('opacity');
const opacityVal = document.getElementById('opacityVal');
const statusEl = document.getElementById('status');
const ytShortcutsEl = document.getElementById('ytShortcuts');

function setStatus(text) {
  statusEl.textContent = text || '';
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureInjected(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => !!window.__subtitleMaskerLoaded,
    });
    return res[0]?.result === true;
  } catch {
    return false;
  }
}

async function inject(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content.js'],
  });
}

async function sendMsg(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    return null;
  }
}

async function execInTab(tabId, func, args = []) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
    });
    return res[0]?.result;
  } catch {
    return null;
  }
}

async function init() {
  const tab = await getTab();
  if (!tab) return;

  const loaded = await ensureInjected(tab.id);

  let state = { visible: false, opacity: 0.9 };
  if (loaded) {
    state = await execInTab(tab.id, () =>
      window.__subtitleMasker
        ? { visible: window.__subtitleMasker.getVisible(), opacity: window.__subtitleMasker.getOpacity() }
        : { visible: false, opacity: 0.9 }
    ) || state;
  } else {
    // Not yet injected — default hidden
    state = { visible: false, opacity: 0.9 };
  }

  toggleEl.checked = state.visible;
  opacityEl.value = Math.round(state.opacity * 100);
  opacityVal.textContent = `${Math.round(state.opacity * 100)}%`;
  
  chrome.storage.local.get('ytShortcuts', d => {
    ytShortcutsEl.checked = d.ytShortcuts !== false;
  });
  
  setStatus('Drag the mask on the page to position it.');
}

toggleEl.addEventListener('change', async () => {
  const tab = await getTab();
  if (!tab) return;

  const loaded = await ensureInjected(tab.id);
  if (!loaded) {
    await inject(tab.id);
  }

  if (toggleEl.checked) {
    await sendMsg(tab.id, { action: 'show' });
    setStatus('Mask enabled.');
  } else {
    await sendMsg(tab.id, { action: 'hide' });
    setStatus('Mask hidden.');
  }
});

opacityEl.addEventListener('input', () => {
  opacityVal.textContent = `${opacityEl.value}%`;
});

opacityEl.addEventListener('change', async () => {
  const tab = await getTab();
  if (!tab) return;
  const val = parseInt(opacityEl.value) / 100;
  await sendMsg(tab.id, { action: 'setOpacity', value: val });
  setStatus(`Opacity set to ${opacityEl.value}%.`);
});

ytShortcutsEl.addEventListener('change', () => {
  const isEnabled = ytShortcutsEl.checked;
  chrome.storage.local.set({ ytShortcuts: isEnabled });
  setStatus(`YouTube shortcuts ${isEnabled ? 'enabled' : 'disabled'}.`);
});

init();

(() => {
  // Idempotency: only run once per frame
  if (window.__subtitleMaskerLoaded) return;
  window.__subtitleMaskerLoaded = true;

  const isIframe = window.self !== window.top;
  const SITE_KEY = `mask_pos_${location.hostname}`;
  const OPACITY_KEY = 'mask_opacity';
  const Dir = { TL: 'tl', TR: 'tr', BR: 'br', BL: 'bl' };

  let overlay = null;
  let visible = false;
  let opacity = 0.9;
  let dragging = false;
  let resizing = false;
  let resizeDir = null;
  let startX = 0, startY = 0;

  // ── Helpers ────────────────────────────────────────────────

  function getMountRoot() {
    return document.fullscreenElement || document.body || document.documentElement;
  }

  function getNumericStyle(el, prop, fallback = 0) {
    const value = parseInt(el.style[prop], 10);
    return Number.isFinite(value) ? value : fallback;
  }

  function getVideoEl() {
    const candidates = [
      document.querySelector('video#video'),
      document.querySelector('.video-content video'),
      document.querySelector('video'),
    ];
    return candidates.find(el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 100;
    });
  }

  function isNnyyHost() {
    return /(^|\.)nnyy\.in$/i.test(location.hostname);
  }

  function getFullscreenContainer() {
    if (isNnyyHost()) {
      return document.querySelector('.video-content') || document.querySelector('.video-content-w') || null;
    }
    return null;
  }

  function syncNnyyFullscreenStyles() {
    if (!isNnyyHost()) return;
    const container = getFullscreenContainer();
    const video = getVideoEl();
    if (!container || !video) return;

    const inFullscreen = document.fullscreenElement === container || document.webkitFullscreenElement === container;

    if (inFullscreen) {
      Object.assign(container.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        maxWidth: '100vw',
        maxHeight: '100vh',
        margin: '0',
        padding: '0',
        background: '#000',
        zIndex: '2147483645',
      });
      video.style.position = 'absolute';
      video.style.inset = '0';
      video.style.width = '100vw';
      video.style.height = '100vh';
      video.style.maxWidth = '100vw';
      video.style.maxHeight = '100vh';
      video.style.objectFit = 'contain';
      video.style.background = '#000';
    } else {
      container.style.position = '';
      container.style.inset = '';
      container.style.width = '';
      container.style.height = '';
      container.style.maxWidth = '';
      container.style.maxHeight = '';
      container.style.margin = '';
      container.style.padding = '';
      container.style.background = '';
      container.style.zIndex = '';
      video.style.position = '';
      video.style.inset = '';
      video.style.width = '';
      video.style.height = '';
      video.style.maxWidth = '';
      video.style.maxHeight = '';
      video.style.objectFit = '';
      video.style.background = '';
    }
  }

  function getDefaultRect() {
    const el = getVideoEl();
    if (el) {
      const r = el.getBoundingClientRect();
      // Only trust the video's rect if it's mostly inside the viewport; on
      // sites like nnyy.in the video sits below the fold until the user
      // scrolls, which would place the overlay offscreen.
      const videoVisible = r.bottom > 80 && r.top < window.innerHeight - 80;
      if (videoVisible) {
        const isNnyy = isNnyyHost();
        const widthRatio = isNnyy ? 0.5 : 0.56;
        const heightRatio = isNnyy ? 0.09 : 0.12;
        const verticalAnchor = isNnyy ? 0.84 : 0.78;
        const w = Math.max(260, Math.round(r.width * widthRatio));
        const h = Math.max(isNnyy ? 48 : 60, Math.round(r.height * heightRatio));
        const top = Math.round(r.top + r.height * verticalAnchor - h / 2);
        const clampedTop = Math.min(top, window.innerHeight - h - 20);
        return {
          left: `${Math.round(r.left + (r.width - w) / 2)}px`,
          top: `${Math.max(20, clampedTop)}px`,
          width: `${w}px`,
          height: `${h}px`,
        };
      }
    }
    const w = Math.round(window.innerWidth * 0.5);
    return {
      left: `${Math.round((window.innerWidth - w) / 2)}px`,
      top: `${Math.round(window.innerHeight - 200)}px`,
      width: `${w}px`,
      height: '80px',
    };
  }

  function loadRect() {
    return new Promise(resolve =>
      chrome.storage.local.get(SITE_KEY, d => resolve(d[SITE_KEY] || null))
    );
  }

  function saveRect() {
    if (!overlay) return;
    chrome.storage.local.set({
      [SITE_KEY]: {
        left: overlay.style.left,
        top: overlay.style.top,
        width: overlay.style.width,
        height: overlay.style.height,
      }
    });
  }

  function loadOpacity() {
    return new Promise(resolve =>
      chrome.storage.local.get(OPACITY_KEY, d =>
        resolve(typeof d[OPACITY_KEY] === 'number' ? d[OPACITY_KEY] : 0.9)
      )
    );
  }

  function saveOpacity() {
    chrome.storage.local.set({ [OPACITY_KEY]: opacity });
  }

  function applyOpacity(val) {
    opacity = Math.max(0, Math.min(1, val));
    if (overlay) overlay.style.background = `rgba(0,0,0,${opacity})`;
  }

  // ── Overlay construction ────────────────────────────────────

  function createHandle(cursor, dir) {
    const h = document.createElement('div');
    Object.assign(h.style, {
      width: '12px', height: '12px',
      background: 'rgba(255,255,255,0.25)',
      borderRadius: '50%',
      position: 'absolute',
      cursor,
      flexShrink: '0',
    });
    h.dataset.dir = dir;
    if (dir === Dir.TL) { h.style.top = '-6px'; h.style.left = '-6px'; }
    if (dir === Dir.TR) { h.style.top = '-6px'; h.style.right = '-6px'; }
    if (dir === Dir.BR) { h.style.bottom = '-6px'; h.style.right = '-6px'; }
    if (dir === Dir.BL) { h.style.bottom = '-6px'; h.style.left = '-6px'; }
    return h;
  }

  function createOpacitySlider() {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'absolute',
      top: '6px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      opacity: '0',
      transition: 'opacity 0.15s',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = Math.round(opacity * 100);
    Object.assign(slider.style, {
      width: '72px',
      cursor: 'pointer',
      pointerEvents: 'all',
      accentColor: 'white',
    });

    const label = document.createElement('span');
    Object.assign(label.style, {
      color: 'white',
      fontSize: '11px',
      fontFamily: 'monospace',
      textShadow: '0 0 3px rgba(0,0,0,1)',
      minWidth: '30px',
      pointerEvents: 'none',
    });
    label.textContent = `${Math.round(opacity * 100)}%`;

    slider.addEventListener('mousedown', e => e.stopPropagation());
    slider.addEventListener('input', e => {
      e.stopPropagation();
      const val = parseInt(e.target.value) / 100;
      label.textContent = `${parseInt(e.target.value)}%`;
      applyOpacity(val);
    });
    slider.addEventListener('change', saveOpacity);

    wrap.appendChild(slider);
    wrap.appendChild(label);

    overlay.addEventListener('mouseenter', () => {
      wrap.style.opacity = '1';
      wrap.style.pointerEvents = 'all';
    });
    overlay.addEventListener('mouseleave', () => {
      wrap.style.opacity = '0';
      wrap.style.pointerEvents = 'none';
    });

    return wrap;
  }

  async function buildOverlay() {
    overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '2147483647',
      background: `rgba(0,0,0,${opacity})`,
      backdropFilter: 'blur(12px)',
      webkitBackdropFilter: 'blur(12px)',
      cursor: 'move',
      boxSizing: 'border-box',
      margin: '0',
      right: 'auto',
      bottom: 'auto',
      border: '0',
      padding: '0',
      overflow: 'visible',
    });

    // Position — discard saved rect if it's outside the current viewport
    const saved = await loadRect();
    let rect = saved;
    if (rect) {
      const t = parseInt(rect.top);
      const l = parseInt(rect.left);
      if (t > window.innerHeight || l > window.innerWidth || t < -200 || l < -200) {
        rect = null;
      }
    }
    rect = rect || getDefaultRect();
    Object.assign(overlay.style, rect);

    // Controls
    overlay.appendChild(createHandle('nwse-resize', Dir.TL));
    overlay.appendChild(createHandle('nesw-resize', Dir.TR));
    overlay.appendChild(createHandle('nwse-resize', Dir.BR));
    overlay.appendChild(createHandle('nesw-resize', Dir.BL));
    overlay.appendChild(createOpacitySlider());

    // Drag / resize — dual-channel: both mousedown and pointerdown
    function onDragStart(e) {
      // Skip slider/label — calling preventDefault on pointerdown bubbling
      // from <input type=range> cancels its native thumb drag.
      const isSlider = e.target.tagName === 'INPUT' || e.target.tagName === 'SPAN';
      if (isSlider) return;
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      const dir = e.target.dataset?.dir;
      if (dir) {
        resizing = true;
        resizeDir = dir;
      } else {
        dragging = true;
      }
      // Pointer capture as enhancement (may fail silently — that's OK)
      if (e.pointerId != null) {
        try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }

    // Use pointerdown only — calling preventDefault on it suppresses the
    // compat mouse events (mousedown/mousemove/mouseup), which would otherwise
    // break window-level drag handlers.
    overlay.addEventListener('pointerdown', onDragStart);

    // Double-click resets position
    overlay.addEventListener('dblclick', () => {
      Object.assign(overlay.style, getDefaultRect());
      saveRect();
    });

    getMountRoot().appendChild(overlay);
  }

  // ── Pointer move / up — main drag handler ──────────────────
  // Uses pointer events (not mouse) because onDragStart preventDefaults the
  // pointerdown, which suppresses the compat mouse events for the gesture.
  // Registered in capture phase on document so players like ArtPlayer that
  // stopPropagation pointer events in fullscreen can't block our drag.

  document.addEventListener('pointermove', e => {
    if (!overlay || (!dragging && !resizing)) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;
    const MIN = 50;

    if (dragging) {
      const left = getNumericStyle(overlay, 'left', overlay.offsetLeft);
      const top = getNumericStyle(overlay, 'top', overlay.offsetTop);
      overlay.style.left = `${left + dx}px`;
      overlay.style.top = `${top + dy}px`;
      return;
    }

    const l = getNumericStyle(overlay, 'left', overlay.offsetLeft);
    const t = getNumericStyle(overlay, 'top', overlay.offsetTop);
    const w = getNumericStyle(overlay, 'width', overlay.offsetWidth);
    const h = getNumericStyle(overlay, 'height', overlay.offsetHeight);

    switch (resizeDir) {
      case Dir.TL:
        overlay.style.left = `${l + dx}px`; overlay.style.top = `${t + dy}px`;
        overlay.style.width = `${Math.max(MIN, w - dx)}px`; overlay.style.height = `${Math.max(MIN, h - dy)}px`;
        break;
      case Dir.TR:
        overlay.style.top = `${t + dy}px`;
        overlay.style.width = `${Math.max(MIN, w + dx)}px`; overlay.style.height = `${Math.max(MIN, h - dy)}px`;
        break;
      case Dir.BR:
        overlay.style.width = `${Math.max(MIN, w + dx)}px`; overlay.style.height = `${Math.max(MIN, h + dy)}px`;
        break;
      case Dir.BL:
        overlay.style.left = `${l + dx}px`;
        overlay.style.width = `${Math.max(MIN, w - dx)}px`; overlay.style.height = `${Math.max(MIN, h + dy)}px`;
        break;
    }
  });

  window.addEventListener('pointerup', () => {
    if (dragging || resizing) saveRect();
    dragging = resizing = false;
    resizeDir = null;
  });
  window.addEventListener('pointercancel', () => {
    dragging = resizing = false;
    resizeDir = null;
  });

  // ── Fullscreen ───────────────────────────────────────────────

  function onFullscreenChange() {
    syncNnyyFullscreenStyles();
    if (!overlay || !visible) return;
    setTimeout(() => {
      syncNnyyFullscreenStyles();
      const mountRoot = getMountRoot();
      if (overlay.parentNode !== mountRoot) {
        mountRoot.appendChild(overlay);
      }
      Object.assign(overlay.style, getDefaultRect());
      saveRect();
    }, 150);
  }

  function hijackNnyyFullscreen() {
    if (!isNnyyHost()) return;
    const video = getVideoEl();
    const container = getFullscreenContainer();
    if (!video || !container || video.__subtitleMaskerFsHijacked) return;

    const originalRequestFullscreen = video.requestFullscreen?.bind(video);
    const originalWebkitRequestFullscreen = video.webkitRequestFullscreen?.bind(video);

    async function requestContainerFullscreen() {
      const target = getFullscreenContainer() || container;
      if (!target) {
        if (originalRequestFullscreen) return originalRequestFullscreen();
        if (originalWebkitRequestFullscreen) return originalWebkitRequestFullscreen();
        return;
      }
      try {
        if (target.requestFullscreen) return await target.requestFullscreen();
        if (target.webkitRequestFullscreen) return target.webkitRequestFullscreen();
      } catch (_) {
        if (originalRequestFullscreen) return originalRequestFullscreen();
        if (originalWebkitRequestFullscreen) return originalWebkitRequestFullscreen();
      }
    }

    function onDblClick(e) {
      if (!container.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      requestContainerFullscreen().then(() => {
        setTimeout(syncNnyyFullscreenStyles, 50);
      }).catch(() => {});
    }

    if (originalRequestFullscreen) {
      video.requestFullscreen = requestContainerFullscreen;
    }
    if (originalWebkitRequestFullscreen) {
      video.webkitRequestFullscreen = requestContainerFullscreen;
    }

    try {
      video.controls = true;
      video.setAttribute('controls', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
    } catch (_) {}

    if (!container.__subtitleMaskerFsButton) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '⛶';
      button.setAttribute('aria-label', 'Fullscreen');
      Object.assign(button.style, {
        position: 'absolute',
        right: '12px',
        top: '12px',
        width: '44px',
        height: '44px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '999px',
        background: 'rgba(0,0,0,0.62)',
        color: '#fff',
        fontSize: '20px',
        fontWeight: '600',
        lineHeight: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: '2147483646',
        boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(6px)',
        webkitBackdropFilter: 'blur(6px)',
      });
      button.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        requestContainerFullscreen().then(() => {
          setTimeout(syncNnyyFullscreenStyles, 50);
        }).catch(() => {});
      });
      container.appendChild(button);
      container.__subtitleMaskerFsButton = button;
    }

    container.addEventListener('dblclick', onDblClick, true);
    video.__subtitleMaskerFsHijacked = true;
  }

  // iframes: show when entering fullscreen, hide when exiting
  function onIframeFullscreenChange() {
    if (document.fullscreenElement) {
      show();
    } else {
      hide();
    }
  }

  if (isIframe) {
    document.addEventListener('fullscreenchange', onIframeFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onIframeFullscreenChange);
  } else {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  // ── Show / hide / toggle ─────────────────────────────────────

  async function show() {
    // iframes only show in fullscreen
    if (isIframe && !document.fullscreenElement) return;

    if (!overlay) {
      const op = await loadOpacity();
      applyOpacity(op);
      await buildOverlay();
    }
    const mountRoot = getMountRoot();
    if (overlay.parentNode !== mountRoot) {
      mountRoot.appendChild(overlay);
    }
    overlay.style.display = 'block';
    visible = true;
  }

  function hide() {
    if (!overlay) return;
    overlay.style.display = 'none';
    visible = false;
  }

  function toggle() {
    visible ? hide() : show();
  }

  // ── Message listener (from popup) ────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'show') { show(); return; }
    if (msg.action === 'hide') { hide(); return; }
    if (msg.action === 'toggle') { toggle(); return; }
    if (msg.action === 'setOpacity') { applyOpacity(msg.value); saveOpacity(); return; }
    if (msg.action === 'getState') {
      sendResponse({ visible, opacity });
      return true;
    }
  });

  // ── Public API ───────────────────────────────────────────────

  window.__subtitleMasker = {
    show, hide, toggle,
    setOpacity: (v) => { applyOpacity(v); saveOpacity(); },
    getVisible: () => visible,
    getOpacity: () => opacity,
  };

  // Reposition overlay when a video element appears or gains dimensions
  function watchForVideo() {
    const existing = getVideoEl();
    if (existing) {
      hijackNnyyFullscreen();
      return;
    }
    const observer = new MutationObserver(() => {
      const el = getVideoEl();
      if (!el) return;
      observer.disconnect();
      hijackNnyyFullscreen();
      if (overlay && visible) {
        // Video just became available — recalculate position
        Object.assign(overlay.style, getDefaultRect());
        saveRect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height', 'src'] });
  }

  // Auto-show on first injection (top frame only)
  if (!isIframe) {
    show();
    watchForVideo();
    hijackNnyyFullscreen();
  }
})();

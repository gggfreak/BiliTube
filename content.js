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
    const specific = [
      document.querySelector('video#video'),
      document.querySelector('.video-content video'),
      document.querySelector('bwp-video')
    ].filter(Boolean);

    const allVideos = Array.from(document.querySelectorAll('video'));
    const candidates = [...specific, ...allVideos];

    let bestFallback = null;

    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 200 && r.height > 100 && r.bottom > 0 && r.top < window.innerHeight) {
        if (!el.paused) return el; // Active playing video is the best match
        if (!bestFallback) bestFallback = el;
      }
    }

    return bestFallback || candidates[0] || null;
  }

  function isNnyyHost() {
    return /(^|\.)nnyy\.in$/i.test(location.hostname);
  }

  function isBilibiliHost() {
    return /(^|\.)bilibili\.com$/i.test(location.hostname);
  }

  function isDouyinHost() {
    return /(^|\.)douyin\.com$/i.test(location.hostname);
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

      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

      if (isFullscreen) {
        // Entering fullscreen: reset to a default position for the fullscreen view.
        // We don't save this position to avoid overwriting the user's normal-view setting.
        Object.assign(overlay.style, getDefaultRect());
      } else {
        // Exiting fullscreen: restore the last saved position.
        loadRect().then(saved => {
          let rect = saved;
          // Validate saved rect to ensure it's (mostly) within the current viewport
          if (rect) {
            const t = parseInt(rect.top);
            const l = parseInt(rect.left);
            if (t > window.innerHeight || l > window.innerWidth || t < -200 || l < -200) {
              rect = null;
            }
          }
          // If we have a valid saved rect, use it. Otherwise, calculate a new default.
          Object.assign(overlay.style, rect || getDefaultRect());
        });
      }
    }, 150);
  }

  function setupEnhancements() {
    if ((!isBilibiliHost() && !isDouyinHost()) || window.__enhancementsInitialized) return;
    window.__enhancementsInitialized = true;

    let ytShortcutsEnabled = true;
    chrome.storage.local.get('ytShortcuts', d => {
      if (d.ytShortcuts !== undefined) ytShortcutsEnabled = d.ytShortcuts;
    });
    chrome.storage.onChanged.addListener(changes => {
      if (changes.ytShortcuts) ytShortcutsEnabled = changes.ytShortcuts.newValue;
    });

    // --- 创建全局复用的提示 UI ---
    const indicator = document.createElement('div');
    Object.assign(indicator.style, {
      position: 'absolute', // 修正：从 'fixed' 改回 'absolute'
      top: '40px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.65)',
      color: '#fff',
      padding: '8px 18px',
      borderRadius: '999px',
      fontSize: '15px',
      fontWeight: 'bold',
      zIndex: '2147483647',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.2s ease',
      backdropFilter: 'blur(4px)',
      webkitBackdropFilter: 'blur(4px)'
    });

    let indicatorTimer = null;
    function showIndicator(text, persist = false) {
      indicator.textContent = text;
      indicator.style.opacity = '1';
      
      let mount = document.body; // 默认挂载到 body
      const video = getVideoEl();

      // 优先挂载到全屏元素
      const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsElement) {
          mount = fsElement;
      } else if (video) {
              // 尝试找到最近的播放器容器（通常是已定位的）
              let currentElement = video.closest('.bpx-player-video-wrap, .bpx-player-video-area, .bilibili-player-video-wrap, .xgplayer, [data-e2e="video-player"]');
          if (!currentElement) { // 如果没有找到特定播放器容器，从视频父元素开始查找
              currentElement = video.parentElement;
          }

          // 向上遍历 DOM 树，找到第一个已定位的父元素作为挂载点
          while (currentElement && currentElement !== document.body && currentElement !== document.documentElement) {
              const position = getComputedStyle(currentElement).position;
              if (position === 'relative' || position === 'absolute' || position === 'fixed') {
                  mount = currentElement;
                  break;
              }
              currentElement = currentElement.parentElement;
          }
      }

      if (indicator.parentNode !== mount) {
        mount.appendChild(indicator);
      }

      if (indicatorTimer) clearTimeout(indicatorTimer);
      if (!persist) {
        indicatorTimer = setTimeout(() => { indicator.style.opacity = '0'; }, 800);
      }
    }

    function hideIndicator() {
      indicator.style.opacity = '0';
      if (indicatorTimer) clearTimeout(indicatorTimer);
    }

    let originalRate = 1;
    let mouseTimer = null;
    let spaceTimer = null;
    let isMouseSpeedingUp = false;
    let isSpaceSpeedingUp = false;

    function applySpeedup(video) {
      if (!video) return;
      // 如果当前没有正在加速的来源，则保存原始倍速
      if (!isMouseSpeedingUp && !isSpaceSpeedingUp) {
        originalRate = video.playbackRate;
      }
      video.playbackRate = 2.0;
      showIndicator('2x ⏩', true);
      if (video.paused) {
        video.play().catch(() => {});
      }
    }

    function removeSpeedup(video) {
      if (!video) return;
      // 只有当鼠标和空格都没有在要求加速时，才恢复原速
      if (!isMouseSpeedingUp && !isSpaceSpeedingUp) {
        video.playbackRate = originalRate;
        hideIndicator();
      }
    }

    window.addEventListener('pointerdown', (e) => {
      // 只响应鼠标左键
      if (e.button !== 0) return;
      const container = e.target.closest('.bpx-player-video-wrap, .bpx-player-video-area, .bilibili-player-video-wrap, .xgplayer, [data-e2e="video-player"]');
      if (!container) return;
      // 忽略对底部控制条等区域的点击
      if (e.target.closest('.bpx-player-control-wrap, .bilibili-player-video-control, .bpx-player-sending-area, .xgplayer-controls, xg-controls')) return;

      const video = getVideoEl();
      if (!video) return;

      // 设定 250ms 延迟，区分普通单击(暂停/播放)与长按
      mouseTimer = setTimeout(() => {
        mouseTimer = null;
        applySpeedup(video);
        isMouseSpeedingUp = true;
      }, 250);
    }, true);

    const stopMouseSpeedup = (e) => {
      if (mouseTimer) {
        clearTimeout(mouseTimer);
        mouseTimer = null;
      }
      if (isMouseSpeedingUp) {
        isMouseSpeedingUp = false;
        const video = getVideoEl();
        removeSpeedup(video);

        // 优雅拦截：放行 pointerup 事件让 B站 正常重置内部状态（防止卡在 2 倍速），
        // 但临时劫持底层的 pause 方法 200ms，以防 B站 把它当成单击而暂停视频。
        if (video) {
          if (!video.__pauseHijacked) {
            const origPause = video.pause;
            video.pause = function() {
              if (video.__blockPauseUntil && Date.now() < video.__blockPauseUntil) return Promise.resolve();
              return origPause.apply(this, arguments);
            };
            video.__pauseHijacked = true;
          }
          video.__blockPauseUntil = Date.now() + 200;
        }

        // 保留旧的 click 拦截作为后备，以应对不同的播放器行为。
        const container = e.target.closest('.bpx-player-video-wrap, .bpx-player-video-area, .bilibili-player-video-wrap, .xgplayer, [data-e2e="video-player"]') || document.body;
        const preventClick = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          container.removeEventListener('click', preventClick, true);
        };
        container.addEventListener('click', preventClick, true);
        
        // 100ms 后兜底清理（以防没有触发 click）
        setTimeout(() => container.removeEventListener('click', preventClick, true), 100);
      }
    };

    window.addEventListener('pointerup', stopMouseSpeedup, true);
    window.addEventListener('pointercancel', stopMouseSpeedup, true);

    // --- 键盘长按空格加速 ---
    // 如果焦点在输入框（如搜索框、评论区），不拦截空格
    const isInput = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    window.addEventListener('keydown', (e) => {
      if (isInput(e.target)) return;
      const video = getVideoEl();
      if (!video) return;

      // 1. 处理长按空格加速 (需要 repeat 判断)
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          spaceTimer = setTimeout(() => {
            spaceTimer = null;
            applySpeedup(video);
            isSpaceSpeedingUp = true;
          }, 250);
        }
        return;
      }

      // 忽略其他带 Ctrl/Alt/Meta 的组合键，防止与系统自带快捷键冲突
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      let handled = false;

      // 2. YouTube 风格常规快捷键
      if (ytShortcutsEnabled) {
        switch (e.key) {
          case 'k': case 'K':
            handled = true;
            video.paused ? video.play().catch(()=>{}) : video.pause();
            break;
          case 'j': case 'J':
            handled = true;
            video.currentTime = Math.max(0, video.currentTime - 10);
            showIndicator('⏪ -10s');
            break;
          case 'l': case 'L':
            handled = true;
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
            showIndicator('+10s ⏩');
            break;
          case 'P': // Shift + p
            handled = true;
            document.querySelector('.bpx-player-ctrl-prev, .xgplayer-play-prev')?.click();
            break;
          case 'N': // Shift + n
            handled = true;
            document.querySelector('.bpx-player-ctrl-next, .bilibili-player-video-btn-next, .xgplayer-play-next')?.click();
            break;
          case 'f': case 'F':
            handled = true;
            document.querySelector('.bpx-player-ctrl-full, .xgplayer-fullscreen, xg-icon[data-state="full-screen"]')?.click() || document.querySelector('.bilibili-player-video-btn-fullscreen')?.click();
            break;
          case 't': case 'T':
            handled = true;
            document.querySelector('.bpx-player-ctrl-web, .xgplayer-cssfullscreen')?.click() || document.querySelector('.bilibili-player-video-web-fullscreen')?.click();
            break;
          case 'i': case 'I':
            handled = true;
            document.querySelector('.bpx-player-ctrl-pip, .xgplayer-pip')?.click();
            break;
          case 'm': case 'M':
            handled = true;
            document.querySelector('.bpx-player-ctrl-volume, .xgplayer-volume, xg-icon[data-state="normal-volume"]')?.click() || (video.muted = !video.muted);
            break;
        }

        // 处理数字键跳转 0% ~ 90%
        if (/^[0-9]$/.test(e.key)) {
          handled = true;
          if (video.duration) {
            video.currentTime = video.duration * (parseInt(e.key) / 10);
            showIndicator(`跳转至 ${e.key}0%`);
          }
        }
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    window.addEventListener('keyup', (e) => {
      if (isInput(e.target)) return;
      const video = getVideoEl();

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();

        if (spaceTimer) {
          // 如果在 250ms 内松开，视为短按，执行普通的播放/暂停切换
          clearTimeout(spaceTimer);
          spaceTimer = null;
          if (video) {
            video.paused ? video.play().catch(() => {}) : video.pause();
          }
        }

        if (isSpaceSpeedingUp) {
          isSpaceSpeedingUp = false;
          removeSpeedup(video);
        }
      }
    }, true);
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
      setupEnhancements();
    }
    
    let timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const el = getVideoEl();
        if (!el) return;
        hijackNnyyFullscreen();
        setupEnhancements();
        if (overlay && visible && !el.__subtitleMaskerPositioned) {
          el.__subtitleMaskerPositioned = true;
          // Video just became available — recalculate position
          Object.assign(overlay.style, getDefaultRect());
          saveRect();
        }
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize on first injection (top frame only)
  if (!isIframe) {
    watchForVideo();
    hijackNnyyFullscreen();
    setupEnhancements();
  }
})();

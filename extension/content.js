// content.js — injected into all pages
// Handles: image hover buttons, YouTube/Vimeo frame capture, Google/Instagram edge cases

(function () {
  "use strict";

  const BTN_CLASS = "refdrop-btn";
  const MIN_SIZE  = 80; // px — ignore tiny images
  const ICON_URL  = chrome.runtime.getURL("icons/icon45.png");

  let activeBtn = null;
  let activeImg = null;

  // ── Style injection ──────────────────────────────────────────────────────────

  const style = document.createElement("style");
  style.id = "refdrop-styles";
  style.textContent = `
    .${BTN_CLASS} {
      position: fixed;
      height: 28px;
      padding: 0 10px 0 7px;
      background: rgba(12,12,12,0.92);
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 6px;
      cursor: pointer;
      display: flex; align-items: center; gap: 5px;
      z-index: 2147483647;
      pointer-events: all;
      transition: background 0.12s, opacity 0.12s;
      box-shadow: 0 2px 10px rgba(0,0,0,0.6);
      user-select: none;
      white-space: nowrap;
    }
    .${BTN_CLASS}:hover { background: rgba(30,30,30,0.98); }
    .${BTN_CLASS} .rd-icon {
      width: 14px; height: 14px;
      object-fit: contain; opacity: .9; flex-shrink: 0;
    }
    .${BTN_CLASS} .rd-label {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px; font-weight: 600;
      color: #e8e8e8; letter-spacing: .2px;
    }
    .${BTN_CLASS}.sending { opacity: 0.45; pointer-events: none; }
    .${BTN_CLASS}.done { background: rgba(36,110,60,0.95); border-color: rgba(80,200,100,.3); }
    .${BTN_CLASS}.error { background: rgba(140,36,36,0.95); border-color: rgba(200,80,80,.3); }
  `;
  (document.head || document.documentElement).appendChild(style);

  // ── Image URL extraction ─────────────────────────────────────────────────────

  function resolveImageSource(img) {
    const host = location.hostname;

    if (host.includes("google."))       return resolveGoogle(img);
    if (host.includes("instagram.com")) return resolveInstagram(img);
    if (host.includes("youtube.com") || host.includes("youtu.be")) return resolveYouTube(img);
    if (host.includes("facebook.com") || host.includes("fbcdn.net")) return resolveFacebook(img);

    // General: srcset → lazy-src → currentSrc → src → canvas
    const srcsetUrl = getBestSrcset(img);
    if (srcsetUrl) return { url: srcsetUrl, referrer: location.href };

    const lazySrc = img.dataset.src
      || img.dataset.lazySrc
      || img.dataset.original
      || img.dataset.imgSrc
      || img.getAttribute("data-lazy")
      || img.getAttribute("data-srcset")?.split(",")[0]?.trim()?.split(" ")[0];
    if (lazySrc && isValidUrl(lazySrc)) return { url: lazySrc, referrer: location.href };

    if (img.currentSrc && !isPlaceholder(img.currentSrc))
      return { url: img.currentSrc, referrer: location.href };

    if (img.src && !isPlaceholder(img.src))
      return { url: img.src, referrer: location.href };

    return tryCanvasExtract(img);
  }

  function resolveGoogle(img) {
    let el = img;
    for (let i = 0; i < 8; i++) {
      el = el.parentElement;
      if (!el) break;

      const jsdata = el.getAttribute("jsdata") || "";
      const urlMatch = jsdata.match(/https?:\/\/[^\s;,'"]+\.(jpg|jpeg|png|webp|gif)[^\s;,'"']*/i);
      if (urlMatch) return { url: urlMatch[0], referrer: "https://www.google.com/" };

      const dataUrl = el.getAttribute("data-url") || el.getAttribute("data-imgurl");
      if (dataUrl && isValidUrl(dataUrl)) return { url: dataUrl, referrer: "https://www.google.com/" };

      if (el.tagName === "A") {
        const imgurl = new URLSearchParams((el.getAttribute("href") || "").split("?")[1] || "").get("imgurl");
        if (imgurl && isValidUrl(imgurl)) return { url: imgurl, referrer: "https://www.google.com/" };
      }
    }

    const srcsetUrl = getBestSrcset(img);
    if (srcsetUrl) return { url: srcsetUrl, referrer: "https://www.google.com/" };
    if (img.src && !isPlaceholder(img.src)) return { url: img.src, referrer: "https://www.google.com/" };
    return null;
  }

  function resolveYouTube(img) {
    // Try to get the highest-quality thumbnail URL from i.ytimg.com
    // YouTube thumbnails: https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg
    const src = img.currentSrc || img.src || "";
    const ytMatch = src.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
    if (ytMatch) {
      // Prefer maxresdefault, fall back to hqdefault
      const id = ytMatch[1];
      return { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, referrer: "https://www.youtube.com/", ytFallback: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    }
    // Non-thumbnail img (channel art, etc.) — use srcset or src directly
    const srcsetUrl = getBestSrcset(img);
    if (srcsetUrl) return { url: srcsetUrl, referrer: "https://www.youtube.com/" };
    if (src && !isPlaceholder(src)) return { url: src, referrer: "https://www.youtube.com/" };
    return null;
  }

  function resolveFacebook(img) {
    // Facebook CDN URLs are signed — no special Referer needed, but be explicit
    const srcsetUrl = getBestSrcset(img);
    if (srcsetUrl) return { url: srcsetUrl, referrer: "https://www.facebook.com/" };
    if (img.currentSrc && !isPlaceholder(img.currentSrc))
      return { url: img.currentSrc, referrer: "https://www.facebook.com/" };
    if (img.src && !isPlaceholder(img.src))
      return { url: img.src, referrer: "https://www.facebook.com/" };
    return tryCanvasExtract(img);
  }

  function resolveInstagram(img) {
    const srcsetUrl = getBestSrcset(img);
    if (srcsetUrl) return { url: srcsetUrl, referrer: "https://www.instagram.com/" };
    if (img.currentSrc && !isPlaceholder(img.currentSrc))
      return { url: img.currentSrc, referrer: "https://www.instagram.com/" };
    if (img.src && !isPlaceholder(img.src))
      return { url: img.src, referrer: "https://www.instagram.com/" };
    return tryCanvasExtract(img);
  }

  function getBestSrcset(img) {
    const raw = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
    if (!raw) return null;
    const entries = raw.split(",")
      .map((s) => { const p = s.trim().split(/\s+/); return { url: p[0], w: parseFloat(p[1]) || 0 }; })
      .filter((e) => isValidUrl(e.url));
    if (!entries.length) return null;
    entries.sort((a, b) => b.w - a.w);
    return entries[0].url;
  }

  function tryCanvasExtract(img) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth  || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl === "data:,") return null;
      return { isBase64: true, data: dataUrl.replace(/^data:image\/png;base64,/, "") };
    } catch { return null; }
  }

  function isValidUrl(url) {
    return typeof url === "string" && url.startsWith("http") && url.length > 10;
  }

  function isPlaceholder(url) {
    if (!url) return true;
    if (url.startsWith("data:image/gif;base64,R0lGODlh")) return true;
    if (url.startsWith("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE")) return true;
    if (url === "about:blank") return true;
    return false;
  }

  // ── Button ───────────────────────────────────────────────────────────────────

  function createBtn() {
    const btn = document.createElement("div");
    btn.className = BTN_CLASS;
    btn.innerHTML = `<img class="rd-icon" src="${ICON_URL}" alt=""><span class="rd-label">RefDrop</span>`;
    btn.title = "Send to PureRef";
    (document.body || document.documentElement).appendChild(btn);
    return btn;
  }

  function positionBtn(btn, img) {
    const r = img.getBoundingClientRect();
    // position: fixed, right-center of image
    // translateX(-100%) shifts button left so its right edge aligns with image right edge
    btn.style.top       = `${r.top + r.height / 2 - 14}px`;
    btn.style.left      = `${r.right - 8}px`;
    btn.style.transform = "translateX(-100%)";
  }

  function removeBtn() {
    if (activeBtn) { activeBtn.remove(); activeBtn = null; }
    activeImg = null;
  }

  function setLabel(btn, text) {
    const label = btn.querySelector(".rd-label");
    if (label) label.textContent = text;
  }

  function flashBtn(btn, cls, labelText) {
    btn.classList.remove("sending");
    btn.classList.add(cls);
    if (labelText) setLabel(btn, labelText);
    setTimeout(() => removeBtn(), 1200);
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  async function sendImage(source) {
    let payload;
    if (source.isBase64) {
      payload = { data: source.data, mime: "image/png" };
    } else {
      payload = { url: source.url, referrer: source.referrer || location.href };
      if (source.ytFallback) payload.ytFallback = source.ytFallback;
    }
    return new Promise((resolve) => chrome.runtime.sendMessage({ type: "send_image", payload }, resolve));
  }

  async function onBtnClick(el) {
    const btn = activeBtn;
    if (!btn) return;

    btn.classList.add("sending");
    setLabel(btn, "Sending…");

    let source;
    if (el.tagName === "VIDEO") {
      // Capture current video frame as PNG
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = el.videoWidth;
        canvas.height = el.videoHeight;
        canvas.getContext("2d").drawImage(el, 0, 0);
        const data = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
        source = { isBase64: true, data };
      } catch {
        flashBtn(btn, "error", "Error"); return;
      }
    } else {
      source = resolveImageSource(el);
      if (!source) { flashBtn(btn, "error", "✕"); return; }
    }

    const result = await sendImage(source);

    if (result?.ok) {
      flashBtn(btn, "done", "Sent ✓");
    } else if (result?.error === "limit_reached") {
      flashBtn(btn, "error", "Limit reached");
    } else if (result?.error === "pureref_not_running") {
      flashBtn(btn, "error", "Open PureRef first");
    } else {
      flashBtn(btn, "error", "Error");
    }
  }

  // ── Hover detection ──────────────────────────────────────────────────────────

  function isEligibleEl(el) {
    if (!el || el.closest(`.${BTN_CLASS}`)) return false;
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth  || r.width  || el.width  || 0;
    const h = el.offsetHeight || r.height || el.height || 0;
    if (el.tagName === "VIDEO") return el.videoWidth > 0 && el.videoHeight > 0;
    return w >= MIN_SIZE && h >= MIN_SIZE;
  }

  /**
   * elementsFromPoint finds the target even through overlay divs.
   * Handles: <img>, <video>, <picture>, card containers with a single img.
   */
  function findElAtPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if ((el.tagName === "IMG" || el.tagName === "VIDEO") && isEligibleEl(el)) return el;
      if (el.tagName === "PICTURE") {
        const img = el.querySelector("img");
        if (img && isEligibleEl(img)) return img;
      }
      if (el !== document.body && el !== document.documentElement) {
        const imgs = [...el.querySelectorAll("img")].filter(isEligibleEl);
        if (imgs.length === 1) return imgs[0];
        // Multiple imgs — pick the one whose center is closest to cursor
        if (imgs.length > 1) {
          let best = null, bestDist = Infinity;
          for (const img of imgs) {
            const r = img.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const d = (cx - x) ** 2 + (cy - y) ** 2;
            if (d < bestDist) { bestDist = d; best = img; }
          }
          if (best) return best;
        }
      }
    }
    return null;
  }

  document.addEventListener("mousemove", (e) => {
    // Skip if cursor is over the button itself
    if (activeBtn && (e.target === activeBtn || activeBtn.contains(e.target))) return;

    const el = findElAtPoint(e.clientX, e.clientY);

    if (!el) {
      if (activeBtn && !activeBtn.matches(":hover")) removeBtn();
      return;
    }

    if (el === activeImg) {
      if (activeBtn) positionBtn(activeBtn, el);
      return;
    }

    removeBtn();
    activeImg = el;
    const btn = createBtn();
    activeBtn = btn;
    positionBtn(btn, el);

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      onBtnClick(el);
    });
  }, { passive: true });

  document.addEventListener("mouseleave", () => removeBtn());

})();

// background.js — Service Worker
// Handles: NativeMessaging, counter, context menu, license

const NATIVE_HOST = "com.refdrop.helper";
const FREE_LIMIT = 50;
const GUMROAD_PRODUCT_PERMALINK = "Refdrop";

// ── License validation ────────────────────────────────────────────────────────

async function verifyLicenseKey(key) {
  try {
    const resp = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        product_permalink: GUMROAD_PRODUCT_PERMALINK,
        license_key: key.trim(),
        increment_uses_count: "false",
      }),
    });
    const data = await resp.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Counter helpers ───────────────────────────────────────────────────────────

async function getCount() {
  const { totalCount = 0 } = await chrome.storage.local.get("totalCount");
  return totalCount;
}

async function incrementCount() {
  const count = await getCount();
  const next = count + 1;
  await chrome.storage.local.set({ totalCount: next });
  return next;
}

async function getLicenseState() {
  const { licenseKey = "", licensed = false } = await chrome.storage.local.get([
    "licenseKey",
    "licensed",
  ]);
  return { licenseKey, licensed };
}

// ── Send image via NativeMessaging ────────────────────────────────────────────

async function sendToHelper(payload) {
  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch {
      resolve({ ok: false, error: "helper_not_installed" });
      return;
    }

    const timer = setTimeout(() => {
      port.disconnect();
      resolve({ ok: false, error: "timeout" });
    }, 20000);

    port.onMessage.addListener((response) => {
      clearTimeout(timer);
      port.disconnect();
      resolve(response);
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      // onMessage may have already resolved; if not, report disconnect
      resolve({ ok: false, error: chrome.runtime.lastError?.message ?? "disconnected" });
    });

    port.postMessage(payload);
  });
}

// ── Core: handle send request ─────────────────────────────────────────────────

async function handleSendImage(payload, sendResponse) {
  const { licensed } = await getLicenseState();
  const count = await getCount();

  if (!licensed && count >= FREE_LIMIT) {
    sendResponse({ ok: false, error: "limit_reached", count });
    return;
  }

  const result = await sendToHelper({ type: "send_image", ...payload });

  if (result.ok) {
    const newCount = await incrementCount();
    sendResponse({ ok: true, count: newCount });
  } else {
    sendResponse(result);
  }
}

// ── Context menu setup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "refdrop_send",
    title: "Send to PureRef",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "refdrop_send") return;

  const { licensed } = await getLicenseState();
  const count = await getCount();
  if (!licensed && count >= FREE_LIMIT) return;

  const payload = {
    url: info.srcUrl,
    referrer: info.pageUrl,
  };
  await handleSendImage(payload, () => {});
});

// ── Message listener (from content.js and popup.js) ──────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case "send_image":
      handleSendImage(msg.payload, sendResponse);
      return true; // async

    case "get_state": {
      Promise.all([getCount(), getLicenseState()]).then(([count, { licensed, licenseKey }]) => {
        sendResponse({ count, licensed, licenseKey, limit: FREE_LIMIT });
      });
      return true;
    }

    case "activate_license": {
      const key = (msg.key || "").trim();
      if (!key) {
        sendResponse({ ok: false, error: "empty_key" });
        return true;
      }
      verifyLicenseKey(key).then(async (valid) => {
        if (valid) {
          await chrome.storage.local.set({ licensed: true, licenseKey: key });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "invalid_key" });
        }
      });
      return true;
    }

    default:
      sendResponse({ ok: false, error: "unknown_type" });
  }
});

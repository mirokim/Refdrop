// popup.js

const GUMROAD_URL = "https://miroverse8.gumroad.com/l/Refdrop";
const HELP_URL = "https://refdrop.app/";                      // update when live
const INSTALLER_URL = "https://github.com/refdrop/refdrop/releases/latest"; // update when live
const FREE_LIMIT = 50;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const dot           = document.getElementById("dot");
const planBadge     = document.getElementById("plan-badge");
const unlimitedLabel= document.getElementById("unlimited-label");
const statsFree     = document.getElementById("stats-free");
const statsPro      = document.getElementById("stats-pro");
const statRemaining = document.getElementById("stat-remaining");
const usageBar      = document.getElementById("usage-bar");
const statTotalPro  = document.getElementById("stat-total-pro");
const limitBox      = document.getElementById("limit-box");
const buyLink       = document.getElementById("buy-link");
const keyInput      = document.getElementById("key-input");
const keyBtn        = document.getElementById("key-btn");
const keyStatus     = document.getElementById("key-status");
const helperWarn    = document.getElementById("helper-warn");
const helperLink    = document.getElementById("helper-link");
const helpLink      = document.getElementById("help-link");

// ── Init ──────────────────────────────────────────────────────────────────────

buyLink.href   = GUMROAD_URL;
helpLink.href  = HELP_URL;
helperLink.href = INSTALLER_URL;
document.getElementById("popup-logo").src = chrome.runtime.getURL("icons/icon45.png");

chrome.runtime.sendMessage({ type: "get_state" }, (state) => {
  if (chrome.runtime.lastError) {
    // Background not reachable
    return;
  }
  render(state);
});

// ── Render ────────────────────────────────────────────────────────────────────

function render(state) {
  const { count = 0, licensed = false } = state;

  dot.className = "dot on";

  if (licensed) {
    renderPro(count);
  } else {
    renderFree(count);
  }
}

function renderFree(count) {
  planBadge.textContent = "FREE";
  planBadge.className = "plan-badge";
  unlimitedLabel.style.display = "none";

  statsFree.style.display = "block";
  statsPro.style.display  = "none";

  const limitReached = count >= FREE_LIMIT;
  const pct = Math.min(count / FREE_LIMIT, 1) * 100;
  usageBar.style.width = `${pct}%`;
  usageBar.style.background = pct >= 100 ? "#c55" : pct >= 70 ? "#b8732a" : "#4a9";

  if (limitReached) {
    statRemaining.textContent = "0";
    statRemaining.className   = "stat-val red";
    limitBox.classList.add("visible");
  } else {
    const remaining = FREE_LIMIT - count;
    statRemaining.textContent = remaining;
    statRemaining.className   = "stat-val green";
    limitBox.classList.remove("visible");
  }
}

function renderPro(count) {
  planBadge.textContent = "✦ PRO";
  planBadge.className = "plan-badge pro";
  unlimitedLabel.style.display = "block";

  statsFree.style.display = "none";
  statsPro.style.display  = "block";

  statTotalPro.textContent = count;

  limitBox.classList.remove("visible");
}

// ── License activation ────────────────────────────────────────────────────────

keyBtn.addEventListener("click", activateLicense);
keyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") activateLicense();
});

function activateLicense() {
  const key = keyInput.value.trim();
  if (!key) return;

  keyBtn.disabled = true;
  keyBtn.textContent = "…";
  keyStatus.textContent = "";
  keyStatus.className = "key-status";

  chrome.runtime.sendMessage({ type: "activate_license", key }, (result) => {
    keyBtn.disabled = false;
    keyBtn.textContent = "Activate";

    if (result?.ok) {
      keyStatus.textContent = "✓ Activated! Reloading…";
      keyStatus.className = "key-status ok";
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "get_state" }, render);
      }, 800);
    } else {
      const msg = result?.error === "invalid_key"
        ? "Invalid license key."
        : "Could not verify. Check connection.";
      keyStatus.textContent = msg;
      keyStatus.className = "key-status err";
    }
  });
}

// ── Helper not installed detection ────────────────────────────────────────────
// background.js returns error: "helper_not_installed" if native connect fails.
// We detect this by listening for a message forwarded from the last send attempt.
// Alternatively, check on popup open by sending a ping-like get_state.
// For now: helperWarn is shown if background signals it via storage.

chrome.storage.local.get("helperMissing", ({ helperMissing }) => {
  if (helperMissing) {
    helperWarn.style.display = "block";
    dot.className = "dot off";
  }
});

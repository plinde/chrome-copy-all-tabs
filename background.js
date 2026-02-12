const DEFAULT_ENABLE_FORMAT_SELECTION = false;
const DEFAULT_FORMAT = "newline";
const ALLOWED_FORMATS = new Set(["newline", "csv", "json"]);
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const NOTIFICATION_ICON_PATH = "notification-icon.svg";
const SUCCESS_BADGE_TEXT = "OK";
const SUCCESS_BADGE_DURATION_MS = 1500;
let creatingOffscreenDocument = null;

function normalizeFormat(rawFormat) {
  return ALLOWED_FORMATS.has(rawFormat) ? rawFormat : DEFAULT_FORMAT;
}

function normalizeSettings(rawSettings = {}) {
  return {
    enableFormatSelection:
      typeof rawSettings.enableFormatSelection === "boolean"
        ? rawSettings.enableFormatSelection
        : DEFAULT_ENABLE_FORMAT_SELECTION,
    defaultFormat: normalizeFormat(rawSettings.defaultFormat),
  };
}

function toCsv(urls) {
  return urls
    .map((url) => `"${String(url).replace(/"/g, '""')}"`)
    .join(",");
}

function formatUrls(urls, format) {
  const safeFormat = normalizeFormat(format);
  if (safeFormat === "csv") {
    return toCsv(urls);
  }
  if (safeFormat === "json") {
    return JSON.stringify(urls);
  }
  return urls.join("\n");
}

async function getTabUrlsForCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .sort((a, b) => a.index - b.index)
    .map((tab) => tab.url)
    .filter((url) => typeof url === "string" && url.length > 0);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get([
    "enableFormatSelection",
    "defaultFormat",
  ]);
  return normalizeSettings(stored);
}

async function applyPopupSetting(enableFormatSelection) {
  await chrome.action.setPopup({
    popup: enableFormatSelection ? "popup.html" : "",
  });
}

async function hasOffscreenDocument() {
  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: "Copy all tab URLs to clipboard from action click.",
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function copyTextFromBackground(text) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    type: "offscreenCopyText",
    text,
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "Failed to write to clipboard.");
  }
}

async function copyCurrentWindowTabUrls(format) {
  const urls = await getTabUrlsForCurrentWindow();
  const text = formatUrls(urls, format);
  await copyTextFromBackground(text);
  return urls.length;
}

async function showCopyNotification() {
  const notificationId = `copy-all-tabs-${Date.now()}`;
  return new Promise((resolve, reject) => {
    chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON_PATH),
      title: "Copy All Tabs",
      message: "All Tabs Copied",
      priority: 0,
    }, (_createdId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function flashSuccessBadge() {
  await chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  await chrome.action.setBadgeText({ text: SUCCESS_BADGE_TEXT });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }, SUCCESS_BADGE_DURATION_MS);
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get([
    "enableFormatSelection",
    "defaultFormat",
  ]);
  const nextSettings = normalizeSettings(stored);
  const updates = {};

  if (typeof stored.enableFormatSelection !== "boolean") {
    updates.enableFormatSelection = nextSettings.enableFormatSelection;
  }
  if (!ALLOWED_FORMATS.has(stored.defaultFormat)) {
    updates.defaultFormat = nextSettings.defaultFormat;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }

  await applyPopupSetting(nextSettings.enableFormatSelection);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await applyPopupSetting(settings.enableFormatSelection);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !("enableFormatSelection" in changes)) {
    return;
  }

  const nextEnabled = Boolean(changes.enableFormatSelection.newValue);
  applyPopupSetting(nextEnabled).catch((error) => {
    console.error("Failed to apply popup setting", error);
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const settings = await getSettings();

    if (settings.enableFormatSelection) {
      // Popup mode is driven by action.setPopup(). Avoid openPopup() here to
      // prevent runtime errors on Chrome variants where this call is restricted.
      await applyPopupSetting(true);
      return;
    }

    await copyCurrentWindowTabUrls(settings.defaultFormat);
    try {
      await showCopyNotification();
    } catch (error) {
      console.warn("Notification failed; using badge fallback", error);
      await flashSuccessBadge();
    }
  } catch (error) {
    console.error("Action click handling failed", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "getFormattedTabUrls") {
    const requestedFormat = message.format;
    getTabUrlsForCurrentWindow()
      .then((urls) => {
        sendResponse({
          ok: true,
          text: formatUrls(urls, requestedFormat),
          count: urls.length,
        });
      })
      .catch((error) => {
        console.error("Failed to collect tab URLs", error);
        sendResponse({
          ok: false,
          error: "Failed to collect tab URLs.",
        });
      });

    return true;
  }

  if (message.type === "applyActionMode") {
    getSettings()
      .then((settings) => applyPopupSetting(settings.enableFormatSelection))
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error("Failed to apply action mode", error);
        sendResponse({ ok: false, error: "Failed to apply action mode." });
      });

    return true;
  }

  if (message.type === "copyCurrentWindowTabUrls") {
    const requestedFormat = message.format;
    copyCurrentWindowTabUrls(requestedFormat)
      .then((count) => {
        sendResponse({ ok: true, count });
      })
      .catch((error) => {
        console.error("Failed to copy tab URLs", error);
        sendResponse({ ok: false, error: "Failed to copy tab URLs." });
      });

    return true;
  }

  if (message.type === "showCopyNotification") {
    showCopyNotification()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error("Failed to show copy notification", error);
        flashSuccessBadge()
          .then(() => {
            sendResponse({ ok: true, fallback: "badge" });
          })
          .catch(() => {
            sendResponse({ ok: false, error: "Failed to show notification." });
          });
      });
    return true;
  }

  return false;
});

getSettings()
  .then((settings) => applyPopupSetting(settings.enableFormatSelection))
  .catch((error) => {
    console.error("Failed to initialize action mode", error);
  });

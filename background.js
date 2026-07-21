const DEFAULT_ENABLE_FORMAT_SELECTION = false;
const DEFAULT_FORMAT = "newline";
const DEFAULT_INCLUDE_TITLES = true;
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
    includeTitles:
      typeof rawSettings.includeTitles === "boolean"
        ? rawSettings.includeTitles
        : DEFAULT_INCLUDE_TITLES,
  };
}

function csvQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function formatTabs(entries, format, includeTitles) {
  const safeFormat = normalizeFormat(format);

  if (safeFormat === "csv") {
    if (includeTitles) {
      return entries
        .map((entry) => `${csvQuote(entry.title)},${csvQuote(entry.url)}`)
        .join("\n");
    }
    return entries.map((entry) => csvQuote(entry.url)).join(",");
  }

  if (safeFormat === "json") {
    if (includeTitles) {
      return JSON.stringify(
        entries.map((entry) => ({ title: entry.title, url: entry.url }))
      );
    }
    return JSON.stringify(entries.map((entry) => entry.url));
  }

  if (includeTitles) {
    return entries
      .map((entry) => `${entry.title}\n${entry.url}`)
      .join("\n\n");
  }
  return entries.map((entry) => entry.url).join("\n");
}

async function getTabEntries(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs
    .sort((a, b) => a.index - b.index)
    .filter((tab) => typeof tab.url === "string" && tab.url.length > 0)
    .filter((tab) => !tab.url.startsWith("chrome://"))
    .map((tab) => ({
      url: tab.url,
      title: typeof tab.title === "string" && tab.title.length > 0 ? tab.title : tab.url,
    }));
}

async function getSettings() {
  const stored = await chrome.storage.sync.get([
    "enableFormatSelection",
    "defaultFormat",
    "includeTitles",
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

async function copyTabUrls(windowId, format, includeTitles) {
  const entries = await getTabEntries(windowId);
  const text = formatTabs(entries, format, includeTitles);
  await copyTextFromBackground(text);
  return entries.length;
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
  await chrome.action.setBadgeBackgroundColor({ color: "#00897b" });
  await chrome.action.setBadgeText({ text: SUCCESS_BADGE_TEXT });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }, SUCCESS_BADGE_DURATION_MS);
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get([
    "enableFormatSelection",
    "defaultFormat",
    "includeTitles",
  ]);
  const nextSettings = normalizeSettings(stored);
  const updates = {};

  if (typeof stored.enableFormatSelection !== "boolean") {
    updates.enableFormatSelection = nextSettings.enableFormatSelection;
  }
  if (!ALLOWED_FORMATS.has(stored.defaultFormat)) {
    updates.defaultFormat = nextSettings.defaultFormat;
  }
  if (typeof stored.includeTitles !== "boolean") {
    updates.includeTitles = nextSettings.includeTitles;
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

    await copyTabUrls(tab.windowId, settings.defaultFormat, settings.includeTitles);
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
    Promise.all([getTabEntries(message.windowId), getSettings()])
      .then(([entries, settings]) => {
        sendResponse({
          ok: true,
          text: formatTabs(entries, requestedFormat, settings.includeTitles),
          count: entries.length,
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

  if (message.type === "copyTabUrls") {
    const requestedFormat = message.format;
    getSettings()
      .then((settings) =>
        copyTabUrls(message.windowId, requestedFormat, settings.includeTitles)
      )
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

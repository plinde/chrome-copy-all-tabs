const DEFAULT_SETTINGS = {
  enableFormatSelection: false,
  defaultFormat: "newline",
};

const ALLOWED_FORMATS = new Set(["newline", "csv", "json"]);

const actionsEl = document.getElementById("actions");
const statusEl = document.getElementById("status");

// Resolve once at init — the popup always belongs to a specific window.
const currentWindowId = chrome.windows.getCurrent().then((win) => win.id);

function normalizeFormat(format) {
  return ALLOWED_FORMATS.has(format) ? format : DEFAULT_SETTINGS.defaultFormat;
}

function normalizeSettings(rawSettings = {}) {
  return {
    enableFormatSelection:
      typeof rawSettings.enableFormatSelection === "boolean"
        ? rawSettings.enableFormatSelection
        : DEFAULT_SETTINGS.enableFormatSelection,
    defaultFormat: normalizeFormat(rawSettings.defaultFormat),
  };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}

async function fetchFormattedUrls(format) {
  const windowId = await currentWindowId;
  const response = await chrome.runtime.sendMessage({
    type: "getFormattedTabUrls",
    format: normalizeFormat(format),
    windowId,
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "Failed to get tab URLs.");
  }

  return response;
}

function copyViaExecCommand(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  return success;
}

async function writeToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn("navigator.clipboard failed; trying execCommand fallback", error);
    }
  }

  if (!copyViaExecCommand(text)) {
    throw new Error("Clipboard copy failed.");
  }
}

async function copyUsingFormat(format) {
  const response = await fetchFormattedUrls(format);
  await writeToClipboard(response.text);
  try {
    await chrome.runtime.sendMessage({ type: "showCopyNotification" });
  } catch (error) {
    console.warn("Notification failed after successful copy", error);
  }
  setStatus(`Copied ${response.count} tab URL${response.count === 1 ? "" : "s"}.`);
}

actionsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-format]");
  if (!button) {
    return;
  }

  const format = button.dataset.format;
  setStatus("");

  try {
    await copyUsingFormat(format);
  } catch (error) {
    console.error("Copy failed", error);
    setStatus("Copy failed.", true);
  }
});

async function init() {
  const stored = await chrome.storage.sync.get([
    "enableFormatSelection",
    "defaultFormat",
  ]);
  const settings = normalizeSettings(stored);

  if (settings.enableFormatSelection) {
    actionsEl.hidden = false;
    setStatus("Choose a format.");
    return;
  }

  actionsEl.hidden = true;
  setStatus("Format chooser is disabled in options.");
}

init().catch((error) => {
  console.error("Failed to initialize popup", error);
  setStatus("Failed to initialize.", true);
});

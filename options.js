const DEFAULT_SETTINGS = {
  enableFormatSelection: false,
  defaultFormat: "newline",
  includeTitles: true,
};

const ALLOWED_FORMATS = new Set(["newline", "csv", "json"]);

const form = document.getElementById("settings-form");
const enableFormatSelectionInput = document.getElementById("enableFormatSelection");
const includeTitlesInput = document.getElementById("includeTitles");
const defaultFormatInput = document.getElementById("defaultFormat");
const statusEl = document.getElementById("status");

function normalizeSettings(rawSettings = {}) {
  return {
    enableFormatSelection:
      typeof rawSettings.enableFormatSelection === "boolean"
        ? rawSettings.enableFormatSelection
        : DEFAULT_SETTINGS.enableFormatSelection,
    defaultFormat: ALLOWED_FORMATS.has(rawSettings.defaultFormat)
      ? rawSettings.defaultFormat
      : DEFAULT_SETTINGS.defaultFormat,
    includeTitles:
      typeof rawSettings.includeTitles === "boolean"
        ? rawSettings.includeTitles
        : DEFAULT_SETTINGS.includeTitles,
  };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    "enableFormatSelection",
    "defaultFormat",
    "includeTitles",
  ]);
  const settings = normalizeSettings(stored);
  enableFormatSelectionInput.checked = settings.enableFormatSelection;
  includeTitlesInput.checked = settings.includeTitles;
  defaultFormatInput.value = settings.defaultFormat;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const settings = normalizeSettings({
    enableFormatSelection: enableFormatSelectionInput.checked,
    defaultFormat: defaultFormatInput.value,
    includeTitles: includeTitlesInput.checked,
  });

  enableFormatSelectionInput.checked = settings.enableFormatSelection;
  includeTitlesInput.checked = settings.includeTitles;
  defaultFormatInput.value = settings.defaultFormat;

  try {
    await chrome.storage.sync.set(settings);
    await chrome.runtime.sendMessage({ type: "applyActionMode" });
    setStatus("Saved.");
  } catch (error) {
    console.error("Failed to save settings", error);
    setStatus("Failed to save settings.", true);
  }
});

loadSettings().catch((error) => {
  console.error("Failed to load settings", error);
  setStatus("Failed to load settings.", true);
});

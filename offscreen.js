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

async function writeTextToClipboard(text) {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "offscreenCopyText") {
    return false;
  }

  writeTextToClipboard(message.text)
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((error) => {
      console.error("Offscreen clipboard write failed", error);
      sendResponse({ ok: false, error: "Clipboard write failed." });
    });

  return true;
});

window.addEventListener("DOMContentLoaded", () => {
  loadOptions();
  setupOptionsListeners();
});

function loadOptions(): void {
  chrome.storage.local.get(
    [
      "redditClientId",
      "redditClientSecret",
      "redditUsername",
      "redditPassword",
    ],
    (data: { [key: string]: any }) => {
      const idEl = document.getElementById("client-id") as HTMLInputElement | null;
      const secEl = document.getElementById("client-secret") as HTMLInputElement | null;
      const userEl = document.getElementById("username") as HTMLInputElement | null;
      const passEl = document.getElementById("password") as HTMLInputElement | null;

      if (idEl && data.redditClientId) idEl.value = data.redditClientId;
      if (secEl && data.redditClientSecret) secEl.value = data.redditClientSecret;
      if (userEl && data.redditUsername) userEl.value = data.redditUsername;
      if (passEl && data.redditPassword) passEl.value = data.redditPassword;

      updateStatusBadge(Boolean(data.redditClientId));
    },
  );

  chrome.runtime.sendMessage({ action: "checkRedditAuth" }, (response) => {
    if (response && response.success) {
      updateStatusBadge(response.mode === "oauth");
    }
  });
}

function updateStatusBadge(isOAuth: boolean): void {
  const badge = document.getElementById("mode-status-badge");
  if (badge) {
    if (isOAuth) {
      badge.textContent = "OAuth API Mode Active";
      badge.className = "badge badge-oauth";
    } else {
      badge.textContent = "Public Search Mode Active";
      badge.className = "badge badge-public";
    }
  }
}

function setupOptionsListeners(): void {
  const saveBtn = document.getElementById("save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const clientId = (document.getElementById("client-id") as HTMLInputElement).value.trim();
      const clientSecret = (document.getElementById("client-secret") as HTMLInputElement).value.trim();
      const username = (document.getElementById("username") as HTMLInputElement).value.trim();
      const password = (document.getElementById("password") as HTMLInputElement).value;

      if (!clientId) {
        showStatus("error", "Client ID is required for OAuth Mode.");
        return;
      }

      showStatus("saving", "Verifying credentials with Reddit API...");

      chrome.runtime.sendMessage(
        {
          action: "saveRedditCredentials",
          credentials: { clientId, clientSecret, username, password },
        },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            showStatus("error", "Failed to communicate with background service worker.");
            return;
          }

          if (response.success) {
            showStatus("success", "Connected successfully! OAuth Mode is now active.");
            updateStatusBadge(true);
          } else {
            showStatus("error", response.error || "Authentication failed. Check your credentials.");
          }
        },
      );
    });
  }

  const resetBtn = document.getElementById("reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      chrome.storage.local.remove(
        [
          "redditClientId",
          "redditClientSecret",
          "redditUsername",
          "redditPassword",
          "redditToken",
        ],
        () => {
          const idEl = document.getElementById("client-id") as HTMLInputElement | null;
          const secEl = document.getElementById("client-secret") as HTMLInputElement | null;
          const userEl = document.getElementById("username") as HTMLInputElement | null;
          const passEl = document.getElementById("password") as HTMLInputElement | null;

          if (idEl) idEl.value = "";
          if (secEl) secEl.value = "";
          if (userEl) userEl.value = "";
          if (passEl) passEl.value = "";

          updateStatusBadge(false);
          showStatus("success", "Switched back to default Public Search Mode (No credentials).");
        },
      );
    });
  }
}

function showStatus(type: "saving" | "success" | "error", message: string): void {
  const box = document.getElementById("status-msg");
  if (box) {
    box.style.display = "block";
    box.className = "status-box " + type;
    box.textContent = message;
  }
}

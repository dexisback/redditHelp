interface RedditPost {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  selftext_preview?: string;
}

interface StorageData {
  pageTitle?: string;
  metaDescription?: string;
  pageUrl?: string;
  selectedText?: string;
}

let currentSearchMode = "auto";
let query = "";
let currentSort = "relevance";
let currentTimePeriod = "all";
let currentData: StorageData = {};
let storedUrlLocally: string | undefined;

window.addEventListener("DOMContentLoaded", function () {
  loadingScreen(true);

  checkAuthAndProceed();
  setupSettingsUI();
  setupFilterButtons();
});

function checkAuthAndProceed(): void {
  chrome.runtime.sendMessage({ action: "checkRedditAuth" }, function (response) {
    if (chrome.runtime.lastError || !response) {
      loadingScreen(false);
      showError("Connection error. Reload the extension.");
      return;
    }

    if (response.authenticated) {
      document.getElementById("settings-panel")!.style.display = "none";
      loadPageData();
    } else {
      loadingScreen(false);
      document.getElementById("settings-panel")!.style.display = "block";
      showAuthStatus("setup", "Configure your Reddit API credentials to start searching.");
      prefillCredentials();
    }
  });
}

function prefillCredentials(): void {
  chrome.storage.local.get(
    ["redditClientId", "redditClientSecret", "redditUsername", "redditPassword"],
    function (data: { [key: string]: any }) {
      if (data.redditClientId) (document.getElementById("reddit-client-id") as HTMLInputElement).value = data.redditClientId as string;
      if (data.redditClientSecret) (document.getElementById("reddit-client-secret") as HTMLInputElement).value = data.redditClientSecret as string;
      if (data.redditUsername) (document.getElementById("reddit-username") as HTMLInputElement).value = data.redditUsername as string;
      if (data.redditPassword) (document.getElementById("reddit-password") as HTMLInputElement).value = data.redditPassword as string;
    },
  );
}

function loadPageData(): void {
  chrome.storage.local.get(
    ["pageTitle", "metaDescription", "pageUrl", "selectedText"],
    function (data: StorageData) {
      if (data.selectedText) {
        query = data.selectedText;
        currentSearchMode = "selected text";
      } else if (data.pageTitle) {
        query = data.pageTitle;
        currentSearchMode = "page title";
      } else {
        storedUrlLocally = data.pageUrl;
        query = urlKeywordsExtractor(storedUrlLocally);
        currentSearchMode = "page URL";
      }

      updateSearchModeIndicator(query, currentSearchMode);
      searchReddit();
    },
  );
}

function setupSettingsUI(): void {
  document.getElementById("settings-toggle")!.addEventListener("click", function () {
    let panel = document.getElementById("settings-panel")!;
    let isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if (!isOpen) prefillCredentials();
  });

  document.getElementById("save-credentials")!.addEventListener("click", function () {
    let clientId = (document.getElementById("reddit-client-id") as HTMLInputElement).value.trim();
    let clientSecret = (document.getElementById("reddit-client-secret") as HTMLInputElement).value.trim();
    let username = (document.getElementById("reddit-username") as HTMLInputElement).value.trim();
    let password = (document.getElementById("reddit-password") as HTMLInputElement).value;

    if (!clientId || !clientSecret || !username || !password) {
      showAuthStatus("error", "All fields are required.");
      return;
    }

    showAuthStatus("saving", "Testing credentials...");

    chrome.runtime.sendMessage(
      {
        action: "saveRedditCredentials",
        credentials: { clientId, clientSecret, username, password },
      },
      function (response) {
        if (chrome.runtime.lastError || !response) {
          showAuthStatus("error", "Connection error. Try again.");
          return;
        }
        if (response.success) {
          showAuthStatus("success", "Connected! Searching Reddit...");
          setTimeout(function () {
            document.getElementById("settings-panel")!.style.display = "none";
            loadPageData();
          }, 800);
        } else {
          showAuthStatus("error", response.error || "Authentication failed. Check credentials.");
        }
      },
    );
  });
}

function setupFilterButtons(): void {
  document
    .querySelectorAll<HTMLElement>(".filter-btn[data-sort]")
    .forEach((btn) => {
      btn.addEventListener("click", function () {
        currentSort = btn.dataset.sort ?? "relevance";

        document
          .querySelectorAll(".filter-btn[data-sort]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        let timeFilter = document.getElementById("time-filter");
        if (timeFilter)
          timeFilter.style.display = currentSort === "top" ? "flex" : "none";

        if (currentSort !== "top") currentTimePeriod = "all";

        searchReddit();
      });
    });

  document
    .querySelectorAll<HTMLElement>(".filter-btn[data-time]")
    .forEach((btn) => {
      btn.addEventListener("click", function () {
        currentTimePeriod = btn.dataset.time ?? "all";

        document
          .querySelectorAll(".filter-btn[data-time]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        searchReddit();
      });
    });
}

function showAuthStatus(type: string, message: string): void {
  let statusEl = document.getElementById("auth-status")!;
  statusEl.style.display = "block";
  statusEl.className = "auth-status " + type;
  statusEl.textContent = message;
}

function searchReddit(): void {
  if (!query) {
    loadingScreen(false);
    showError("No search query available. Try selecting some text on the page.");
    return;
  }

  clearResults();
  hideError();
  loadingScreen(true);

  chrome.runtime.sendMessage(
    {
      action: "amaan_ka_sandesh_for_background_script",
      query: query.trim(),
      limit: 20,
      sortBy: currentSort,
      timePeriod: currentTimePeriod,
    },
    function (response: {
      success: boolean;
      data?: RedditPost[];
      error?: string;
    }) {
      loadingScreen(false);

      if (chrome.runtime.lastError) {
        showError("Connection error. Please try again.");
        return;
      }

      if (!response || !response.success) {
        showError(response?.error || "Failed to fetch Reddit discussions.");
        return;
      }

      showFilterBar();
      displayResults(response.data ?? []);
    },
  );
}

function urlKeywordsExtractor(url: string | undefined): string {
  if (!url) return "general discussion";

  try {
    let urlObj = new URL(url);
    let pathParts = urlObj.pathname
      .split("/")
      .filter((part) => part.length > 2)
      .map((part) => part.replace(/[-_]/g, " "))
      .slice(0, 7);

    if (pathParts.length === 0) return urlObj.hostname.replace(/^www\./, "");
    return pathParts.join(" ");
  } catch {
    return "general discussion";
  }
}

function updateSearchModeIndicator(q: string, mode: string): void {
  let searchModeDiv = document.getElementById("search-mode");
  if (searchModeDiv) {
    let searchInfo = searchModeDiv.querySelector<HTMLElement>(".search-info");
    if (searchInfo)
      searchInfo.innerHTML = `<strong>Searching by ${mode}:</strong> <span class="query">"${q}"</span>`;
  }
}

function showFilterBar(): void {
  let filterBar = document.getElementById("filter-bar");
  if (filterBar) filterBar.style.display = "flex";
}

function loadingScreen(show: boolean): void {
  let loadingDiv = document.getElementById("loading");
  if (loadingDiv) loadingDiv.style.display = show ? "flex" : "none";
}

function showError(message: string): void {
  let errorDiv = document.getElementById("error");
  if (errorDiv) {
    let msgEl = errorDiv.querySelector(".error-message");
    if (msgEl) msgEl.textContent = message;
    errorDiv.style.display = "flex";
  }
}

function hideError(): void {
  let errorDiv = document.getElementById("error");
  if (errorDiv) errorDiv.style.display = "none";
}

function clearResults(): void {
  let resultsDiv = document.getElementById("results");
  if (resultsDiv) resultsDiv.innerHTML = "";
}

function displayResults(redditPosts: RedditPost[]): void {
  let resultsDiv = document.getElementById("results");
  if (!resultsDiv) return;
  resultsDiv.innerHTML = "";

  if (redditPosts.length === 0) {
    showError("No discussions found on Reddit for this topic.");
    return;
  }

  let postsContainer = document.createElement("div");
  postsContainer.className = "posts-container";

  redditPosts.forEach(function (post) {
    postsContainer.appendChild(createPostElement(post));
  });

  resultsDiv.appendChild(postsContainer);

  let countDiv = document.createElement("div");
  countDiv.className = "results-count";
  countDiv.textContent = `Found ${redditPosts.length} discussions`;
  resultsDiv.insertBefore(countDiv, postsContainer);
}

function createPostElement(post: RedditPost): HTMLDivElement {
  let div = document.createElement("div");
  div.className = "reddit-post";

  let scoreText = formatScore(post.score);
  let timeText = formatTime(post.created_utc);
  let displayTitle =
    post.title.length > 80 ? post.title.substring(0, 80) + "..." : post.title;

  div.innerHTML = `
    <div class="post-header">
      <h3 class="post-title">
        <a href="${post.url}" target="_blank" title="${post.title}">
          ${displayTitle}
        </a>
      </h3>
    </div>

    <div class="post-meta">
      <span class="subreddit">r/${post.subreddit}</span>
      <span class="separator">•</span>
      <span class="score">${scoreText} upvotes</span>
      <span class="separator">•</span>
      <span class="time">${timeText}</span>
      <span class="separator">•</span>
      <span class="comments">${post.num_comments} comments</span>
    </div>

    ${
      post.selftext_preview
        ? `<p class="post-preview">${post.selftext_preview}</p>`
        : `<p class="post-preview">Click to read discussion</p>`
    }
  `;

  div.addEventListener("click", function (e) {
    if ((e.target as HTMLElement).tagName !== "A")
      window.open(post.url, "_blank");
  });

  return div;
}

function formatScore(score: number): string {
  if (score >= 10000) return Math.floor(score / 1000) + "k";
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return score.toString();
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "unknown";

  let now = Date.now() / 1000;
  let diff = now - timestamp;

  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

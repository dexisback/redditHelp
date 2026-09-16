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

interface PageData {
  selectedText?: string;
  pageTitle?: string;
  rawTitle?: string;
  metaDescription?: string;
  pageUrl?: string;
}

interface SearchModeOption {
  mode: string;
  query: string;
}

let activeQuery = "";
let currentSort = "relevance";
let currentTimePeriod = "all";
let availableModes: SearchModeOption[] = [];
let currentModeIndex = 0;

window.addEventListener("DOMContentLoaded", function () {
  loadingScreen(true);

  checkAuthAndProceed();
  setupFilterButtons();
  setupActionButtons();
  setupKeyboardShortcuts();
});

function checkAuthAndProceed(): void {
  chrome.runtime.sendMessage({ action: "checkRedditAuth" }, function (response) {
    if (chrome.runtime.lastError || !response) {
      console.warn("Could not check Reddit auth, defaulting to public search.");
    }
    loadPageData();
  });
}

function loadPageData(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs && tabs[0];
    if (activeTab && activeTab.id) {
      // Attempt to communicate directly with active tab's content script
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: "getPageInfo" },
        function (response: PageData | undefined) {
          if (!chrome.runtime.lastError && response) {
            processExtractedPageData(response);
          } else {
            // Fallback to tab properties and storage
            chrome.storage.local.get(
              ["pageTitle", "metaDescription", "pageUrl", "selectedText"],
              function (storedData: PageData) {
                const combinedData: PageData = {
                  selectedText: storedData.selectedText,
                  pageTitle: storedData.pageTitle || (activeTab.title ? cleanPageTitle(activeTab.title) : ""),
                  rawTitle: activeTab.title || "",
                  pageUrl: activeTab.url || storedData.pageUrl || "",
                };
                processExtractedPageData(combinedData);
              },
            );
          }
        },
      );
    } else {
      chrome.storage.local.get(
        ["pageTitle", "metaDescription", "pageUrl", "selectedText"],
        function (storedData: PageData) {
          processExtractedPageData(storedData);
        },
      );
    }
  });
}

function processExtractedPageData(data: PageData): void {
  availableModes = [];

  const selectedText = data.selectedText ? data.selectedText.trim() : "";
  const pageTitle = data.pageTitle ? data.pageTitle.trim() : "";
  const urlKeywords = urlKeywordsExtractor(data.pageUrl);

  if (selectedText) {
    availableModes.push({ mode: "selected text", query: selectedText });
  }
  if (pageTitle) {
    availableModes.push({ mode: "page title", query: pageTitle });
  }
  if (urlKeywords) {
    availableModes.push({ mode: "page URL", query: urlKeywords });
  }

  if (availableModes.length === 0) {
    loadingScreen(false);
    showEmptyState(true);
    return;
  }

  showEmptyState(false);
  currentModeIndex = 0;
  applyCurrentSearchMode();
}

function applyCurrentSearchMode(): void {
  if (availableModes.length === 0) return;

  const currentOption = availableModes[currentModeIndex % availableModes.length];
  activeQuery = currentOption.query;

  updateSearchModeIndicator(activeQuery, currentOption.mode);

  const switchBtn = document.getElementById("switch-mode");
  if (switchBtn) {
    if (availableModes.length > 1) {
      const nextIndex = (currentModeIndex + 1) % availableModes.length;
      const nextMode = availableModes[nextIndex].mode;
      switchBtn.textContent = `🔄 Mode (${nextMode})`;
      switchBtn.style.display = "flex";
    } else {
      switchBtn.textContent = `🔄 Refresh`;
      switchBtn.style.display = "flex";
    }
  }

  searchReddit();
}

function setupActionButtons(): void {
  const switchBtn = document.getElementById("switch-mode");
  if (switchBtn) {
    switchBtn.addEventListener("click", function () {
      if (availableModes.length > 1) {
        currentModeIndex = (currentModeIndex + 1) % availableModes.length;
        applyCurrentSearchMode();
      } else {
        searchReddit();
      }
    });
  }

  const settingsBtn = document.getElementById("open-settings");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", function () {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("options.html"), "_blank");
      }
    });
  }
}

function setupKeyboardShortcuts(): void {
  document.addEventListener("keydown", function (e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }

    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      searchReddit();
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      if (availableModes.length > 1) {
        currentModeIndex = (currentModeIndex + 1) % availableModes.length;
        applyCurrentSearchMode();
      } else {
        searchReddit();
      }
    }
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

        const timeFilter = document.getElementById("time-filter");
        if (timeFilter) {
          timeFilter.style.display = currentSort === "top" ? "flex" : "none";
        }

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

function searchReddit(): void {
  if (!activeQuery) {
    loadingScreen(false);
    showError("No search query available. Try selecting text on the page.");
    return;
  }

  clearResults();
  hideError();
  showEmptyState(false);
  loadingScreen(true);

  chrome.runtime.sendMessage(
    {
      action: "amaan_ka_sandesh_for_background_script",
      query: activeQuery.trim(),
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
        showError("Connection error with background service worker.");
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

function cleanPageTitle(title: string): string {
  if (!title) return "";
  const commonStopWords = [
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "a", "an", "the", "and", "but", "if", "or", "because",
    "as", "until", "while", "of", "at", "by", "for", "with", "about", "against",
    "between", "into", "through", "during", "before", "after", "above", "below",
    "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again",
  ];

  const cleaned = title
    .replace(/[^\w\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

  return cleaned
    .split(" ")
    .filter((w) => w.length > 2 && !commonStopWords.includes(w))
    .slice(0, 6)
    .join(" ");
}

function urlKeywordsExtractor(url: string | undefined): string {
  if (!url) return "";

  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname
      .split("/")
      .filter((part) => part.length > 2)
      .map((part) => part.replace(/[-_]/g, " "))
      .slice(0, 7);

    if (pathParts.length === 0) {
      return urlObj.hostname.replace(/^www\./, "");
    }
    return pathParts.join(" ");
  } catch {
    return "";
  }
}

function updateSearchModeIndicator(q: string, mode: string): void {
  const searchModeDiv = document.getElementById("search-mode");
  if (searchModeDiv) {
    const searchInfo = searchModeDiv.querySelector<HTMLElement>(".search-info");
    if (searchInfo) {
      searchInfo.innerHTML = `<strong>Searching by ${mode}:</strong> <span class="query" title="${escapeHtml(q)}">"${escapeHtml(q)}"</span>`;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showFilterBar(): void {
  const filterBar = document.getElementById("filter-bar");
  if (filterBar) filterBar.style.display = "flex";
}

function loadingScreen(show: boolean): void {
  const loadingDiv = document.getElementById("loading");
  if (loadingDiv) loadingDiv.style.display = show ? "flex" : "none";
}

function showError(message: string): void {
  const errorDiv = document.getElementById("error");
  if (errorDiv) {
    const msgEl = errorDiv.querySelector(".error-message");
    if (msgEl) msgEl.textContent = message;
    errorDiv.style.display = "flex";
  }
}

function hideError(): void {
  const errorDiv = document.getElementById("error");
  if (errorDiv) errorDiv.style.display = "none";
}

function showEmptyState(show: boolean): void {
  const emptyDiv = document.getElementById("empty-state");
  if (emptyDiv) emptyDiv.style.display = show ? "flex" : "none";
}

function clearResults(): void {
  const resultsDiv = document.getElementById("results");
  if (resultsDiv) resultsDiv.innerHTML = "";
}

function displayResults(redditPosts: RedditPost[]): void {
  const resultsDiv = document.getElementById("results");
  if (!resultsDiv) return;
  resultsDiv.innerHTML = "";

  if (redditPosts.length === 0) {
    showError("No discussions found on Reddit for this topic.");
    return;
  }

  const postsContainer = document.createElement("div");
  postsContainer.className = "posts-container";

  redditPosts.forEach(function (post) {
    postsContainer.appendChild(createPostElement(post));
  });

  resultsDiv.appendChild(postsContainer);

  const countDiv = document.createElement("div");
  countDiv.className = "results-count";
  countDiv.textContent = `Found ${redditPosts.length} discussions`;
  resultsDiv.insertBefore(countDiv, postsContainer);
}

function createPostElement(post: RedditPost): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "reddit-post";

  const timeText = formatTime(post.created_utc);
  const displayTitle =
    post.title.length > 90 ? post.title.substring(0, 90) + "..." : post.title;

  const metaParts: string[] = [
    `<span class="subreddit">r/${escapeHtml(post.subreddit)}</span>`,
  ];

  if (post.score > 0) {
    metaParts.push(`<span class="score">${formatScore(post.score)} upvotes</span>`);
  }

  metaParts.push(`<span class="time">${timeText}</span>`);

  if (post.num_comments > 0) {
    metaParts.push(`<span class="comments">${post.num_comments} comments</span>`);
  }

  const metaHtml = metaParts.join('<span class="separator">•</span>');

  div.innerHTML = `
    <div class="post-header">
      <h3 class="post-title">
        <a href="${post.url}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(post.title)}">
          ${escapeHtml(displayTitle)}
        </a>
      </h3>
    </div>

    <div class="post-meta">
      ${metaHtml}
    </div>

    ${
      post.selftext_preview
        ? `<p class="post-preview">${escapeHtml(post.selftext_preview)}</p>`
        : `<p class="post-preview">Click to view discussion</p>`
    }
  `;

  div.addEventListener("click", function (e) {
    if ((e.target as HTMLElement).tagName !== "A") {
      window.open(post.url, "_blank");
    }
  });

  return div;
}

function formatScore(score: number): string {
  if (score >= 1000000) return (score / 1000000).toFixed(1) + "M";
  if (score >= 10000) return Math.floor(score / 1000) + "k";
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return score.toString();
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "unknown";

  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

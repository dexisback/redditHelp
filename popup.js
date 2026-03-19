let currentSearchMode = "auto";
let query = "";
let currentData = {};
let storedUrlLocally;

window.addEventListener("DOMContentLoaded", function () {
  loadingScreen(true);

  chrome.storage.local.get(
    ["pageTitle", "metaDescription", "pageUrl", "selectedText"],
    function (data) {
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
      searchReddit(query);
    },
  );

  function searchReddit(query) {
    if (!query) {
      loadingScreen(false);
      showError(
        "No search query available. Try selecting some text on the page.",
      );
      return;
    }

    chrome.runtime.sendMessage(
      {
        action: "amaan_ka_sandesh_for_background_script",
        query: query.trim(),
        limit: 8,
      },
      function (response) {
        loadingScreen(false);

        if (chrome.runtime.lastError) {
          showError("Connection error. Please try again.");
          return;
        }

        if (!response || !response.success) {
          showError(response?.error || "Failed to fetch Reddit discussions.");
          return;
        }

        displayResults(response.data);
      },
    );
  }

  function urlKeywordsExtractor(url) {
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
    } catch (err) {
      return "general discussion";
    }
  }
});

function updateSearchModeIndicator(query, mode) {
  let searchModeDiv = document.getElementById("search-mode");
  if (searchModeDiv) {
    searchModeDiv.querySelector(".search-info").innerHTML =
      `<strong>Searching by ${mode}:</strong> <span class="query">"${query}"</span>`;
  }
}

function loadingScreen(show) {
  let loadingDiv = document.getElementById("loading");
  if (loadingDiv) loadingDiv.style.display = show ? "flex" : "none";
}

function showError(message) {
  let errorDiv = document.getElementById("error");
  if (errorDiv) {
    let msgEl = errorDiv.querySelector(".error-message"); // target the child so the icon and suggestion text in the HTML stay intact
    if (msgEl) msgEl.textContent = message;
    errorDiv.style.display = "flex";
  }
}

function hideError() {
  let errorDiv = document.getElementById("error");
  if (errorDiv) errorDiv.style.display = "none";
}

function clearResults() {
  let resultsDiv = document.getElementById("results");
  if (resultsDiv) resultsDiv.innerHTML = "";
}

function displayResults(redditPosts) {
  let resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  if (!redditPosts || redditPosts.length === 0) {
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

function createPostElement(post) {
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
    if (e.target.tagName !== "A") window.open(post.url, "_blank"); // don't double-fire if they clicked the title link
  });

  return div;
}

function formatScore(score) {
  if (score >= 10000) return Math.floor(score / 1000) + "k";
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return score.toString();
}

function formatTime(timestamp) {
  if (!timestamp) return "unknown";

  let now = Date.now() / 1000; // Reddit timestamps are Unix seconds, not ms
  let diff = now - timestamp;

  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

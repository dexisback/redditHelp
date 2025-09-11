// === Backend logic (your code) ===

let currentSearchMode = "auto";
let searchQuery = "";
let curretnData = {};
let storedUrlLocally;

// when DOM is loaded up
window.addEventListener("DOMContentLoaded", function () {
  chrome.storage.local.get([
    'pageTitle',
    'metaDescription',
    'pageUrl',
    'selectedText'
  ], function (data) { // callback function
    if (data.selectedText) {
      searchQuery = data.selectedText;
      currentSearchMode = "selected text";
    }
    else if (data.pageTitle) {
      searchQuery = data.pageTitle;
      currentSearchMode = "page title";
    }
    else {
      // store the pageUrl because i wanna use it
      storedUrlLocally = data.pageUrl;
      searchQuery = urlKeywordsExtractor(storedUrlLocally);
      currentSearchMode = "page Url";
    }

    // ✅ only call after query is ready
    searchReddit(searchQuery);
  });


  function searchReddit(query) {
    if (!query) {
      showError(`sorry lmao`);
      return;
    }
    else {
      // send the message to radar for someone (background script to catch):
      chrome.runtime.sendMessage({
        action: "amaan_ka_sandesh_for_background_script",
        query: query.trim(),
        limit: 8
      }, function (response) { // choose what we do with the response
        loadingScreen(false); // hide loading screen;
        if (chrome.runtime.lastError) {
          showError(`lmao square`);
          return;
        }
        else if (response) { // else if response does actually exist
          // show the response.data in our display:
          displayResults(response.data);
        }
      })
    }
  }

  function urlKeywordsExtractor(storedUrlLocally) {
    if (!storedUrlLocally) return "general discussion";

    try {
      // https://example.com/learn/programming/javascript/react/hooks
      // https://shop.com/products/iphone15/review
      let urlObj = new URL(storedUrlLocally);
      let pathParts = urlObj.pathname.split("/")
        .filter(part => part.length > 2)
        // .filter(part => !part.match(/^\d+$/)) // optional
        .map(part => part.replace(/[-_]/g, " "))
        .slice(0, 7);

      if (pathParts.length === 0) {
        return urlObj.hostname.replace(/^www\./, "");
      }
      return pathParts.join(" ");
    }
    catch (err) {
      return "general discussion";
    }
  }
});


// === UI / DOM Helpers (from original popup.js) ===

// Show or hide the loading spinner
function loadingScreen(show) {
  let loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = show ? 'block' : 'none';
  }
}

// Show error message
function showError(message) {
  let errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// Clear error message
function hideError() {
  let errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.style.display = 'none';
  }
}

// Clear results
function clearResults() {
  let resultsDiv = document.getElementById('results');
  if (resultsDiv) {
    resultsDiv.innerHTML = '';
  }
}

// Display Reddit results
function displayResults(redditPosts) {
  let resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';

  if (!redditPosts || redditPosts.length === 0) {
    showError("No discussions found on Reddit");
    return;
  }

  let postsContainer = document.createElement('div');
  postsContainer.className = 'posts-container';

  redditPosts.forEach(function (post) {
    let postElement = createPostElement(post);
    postsContainer.appendChild(postElement);
  });

  resultsDiv.appendChild(postsContainer);

  let countDiv = document.createElement('div');
  countDiv.className = 'results-count';
  countDiv.textContent = `Found ${redditPosts.length} discussions`;
  resultsDiv.insertBefore(countDiv, postsContainer);
}

// Create HTML element for a Reddit post
function createPostElement(post) {
  let div = document.createElement('div');
  div.className = 'reddit-post';

  let scoreText = formatScore(post.score);
  let timeText = formatTime(post.created);

  let displayTitle = post.title.length > 80 ?
    post.title.substring(0, 80) + '...' :
    post.title;

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
    
    ${post.selftext_preview ?
      `<p class="post-preview">${post.selftext_preview}</p>` :
      '<p class="post-preview">Click to read discussion</p>'
    }
  `;

  div.addEventListener('click', function (e) {
    if (e.target.tagName !== 'A') {
      window.open(post.url, '_blank');
    }
  });

  return div;
}

// Format upvotes
function formatScore(score) {
  if (score >= 10000) {
    return Math.floor(score / 1000) + 'k';
  } else if (score >= 1000) {
    return (score / 1000).toFixed(1) + 'k';
  } else {
    return score.toString();
  }
}

// Format post time
function formatTime(timestamp) {
  if (!timestamp) return 'unknown';

  let now = Date.now() / 1000;
  let diff = now - timestamp;

  if (diff < 3600) {
    let minutes = Math.floor(diff / 60);
    return `${minutes}m ago`;
  } else if (diff < 86400) {
    let hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  } else if (diff < 2592000) {
    let days = Math.floor(diff / 86400);
    return `${days}d ago`;
  } else if (diff < 31536000) {
    let months = Math.floor(diff / 2592000);
    return `${months}mo ago`;
  } else {
    let years = Math.floor(diff / 31536000);
    return `${years}y ago`;
  }
}



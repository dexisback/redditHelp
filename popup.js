// HINT: This runs when user clicks extension icon

// Global variables to track current state
let currentSearchMode = 'auto'; // 'selected', 'page', 'auto'
let currentData = {};

// When popup opens
document.addEventListener('DOMContentLoaded', function() {
  
  // Get stored data from content script
  chrome.storage.local.get([
    'selectedText', 
    'hasSelection', 
    'pageTitle', 
    'pageUrl',
    'metaDescription'
  ], function(data) {
    
    // Store data globally for mode switching
    currentData = data;
    
    // Decide what to search for
    let searchQuery = "";
    let searchMode = "";
    
    // Priority 1: If user selected text
    if (data.hasSelection && data.selectedText) {
      searchQuery = data.selectedText;
      searchMode = "Selected Text";
      currentSearchMode = 'selected';
      
    // Priority 2: Use page title
    } else if (data.pageTitle) {
      searchQuery = data.pageTitle;
      searchMode = "Page Topic";
      currentSearchMode = 'page';
      
    // Fallback: Use URL
    } else {
      searchQuery = extractKeywordsFromUrl(data.pageUrl);
      searchMode = "Page URL";
      currentSearchMode = 'url';
    }
    
    // Update UI to show what we're searching
    updateSearchModeDisplay(searchMode, searchQuery);
    
    // Set up mode switch button
    setupModeSwitch();
    
    // Start searching Reddit
    searchReddit(searchQuery);
  });
  
  // Handle mode switching button
  document.getElementById('switch-mode').addEventListener('click', function() {
    switchSearchMode();
  });
});

// Main search function
function searchReddit(query) {
  
  // Don't search if query is empty
  if (!query || query.trim().length === 0) {
    showError("No search terms available");
    return;
  }
  
  // Show loading state
  showLoading(true);
  hideError();
  clearResults();
  
  // Send message to background script to do API call
  chrome.runtime.sendMessage({
    action: "searchReddit",
    query: query.trim(),
    limit: 8
  }, function(response) {
    
    // Hide loading
    showLoading(false);
    
    // Check if message was received
    if (chrome.runtime.lastError) {
      showError("Extension communication error");
      return;
    }
    
    // Handle response
    if (response && response.success) {
      displayResults(response.data);
    } else {
      showError(response?.error || "Failed to fetch Reddit results");
    }
  });
}

// Display Reddit results in popup
function displayResults(redditPosts) {
  
  let resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';
  
  if (!redditPosts || redditPosts.length === 0) {
    showError("No discussions found on Reddit");
    return;
  }
  
  // Create container for all posts
  let postsContainer = document.createElement('div');
  postsContainer.className = 'posts-container';
  
  // Loop through each Reddit post
  redditPosts.forEach(function(post) {
    
    // Create HTML element for each result
    let postElement = createPostElement(post);
    postsContainer.appendChild(postElement);
  });
  
  resultsDiv.appendChild(postsContainer);
  
  // Show results count
  let countDiv = document.createElement('div');
  countDiv.className = 'results-count';
  countDiv.textContent = `Found ${redditPosts.length} discussions`;
  resultsDiv.insertBefore(countDiv, postsContainer);
}

// Create HTML for single Reddit post
function createPostElement(post) {
  
  let div = document.createElement('div');
  div.className = 'reddit-post';
  
  // Format the score
  let scoreText = formatScore(post.score);
  
  // Format the time
  let timeText = formatTime(post.created);
  
  // Truncate title if too long
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
  
  // Add click handler for entire post
  div.addEventListener('click', function(e) {
    // Don't trigger if user clicked the link directly
    if (e.target.tagName !== 'A') {
      window.open(post.url, '_blank');
    }
  });
  
  return div;
}

// Switch between search modes
function switchSearchMode() {
  
  let newQuery = "";
  let newMode = "";
  
  // Cycle through available modes
  if (currentSearchMode === 'selected' && currentData.pageTitle) {
    // Switch from selected text to page topic
    newQuery = currentData.pageTitle;
    newMode = "Page Topic";
    currentSearchMode = 'page';
    
  } else if (currentSearchMode === 'page' && currentData.hasSelection && currentData.selectedText) {
    // Switch from page topic to selected text
    newQuery = currentData.selectedText;
    newMode = "Selected Text";
    currentSearchMode = 'selected';
    
  } else if (currentSearchMode === 'page' && currentData.pageUrl) {
    // Switch from page topic to URL keywords
    newQuery = extractKeywordsFromUrl(currentData.pageUrl);
    newMode = "Page URL";
    currentSearchMode = 'url';
    
  } else if (currentSearchMode === 'url' && currentData.hasSelection && currentData.selectedText) {
    // Switch from URL to selected text
    newQuery = currentData.selectedText;
    newMode = "Selected Text";
    currentSearchMode = 'selected';
    
  } else {
    // No other mode available
    showError("No alternative search available");
    return;
  }
  
  // Update UI and search
  updateSearchModeDisplay(newMode, newQuery);
  setupModeSwitch();
  searchReddit(newQuery);
}

// Set up the mode switch button text
function setupModeSwitch() {
  
  let switchButton = document.getElementById('switch-mode');
  let buttonText = "";
  
  // Determine what the button should say
  if (currentSearchMode === 'selected' && currentData.pageTitle) {
    buttonText = "🔄 Switch to Page Topic";
    
  } else if (currentSearchMode === 'page' && currentData.hasSelection && currentData.selectedText) {
    buttonText = "🔄 Switch to Selected Text";
    
  } else if (currentSearchMode === 'page' && currentData.pageUrl) {
    buttonText = "🔄 Try URL Keywords";
    
  } else if (currentSearchMode === 'url' && currentData.hasSelection) {
    buttonText = "🔄 Switch to Selected Text";
    
  } else {
    // No alternative available, hide button
    switchButton.style.display = 'none';
    return;
  }
  
  switchButton.textContent = buttonText;
  switchButton.style.display = 'block';
}

// Extract keywords from URL
function extractKeywordsFromUrl(url) {
  
  if (!url) return "general discussion";
  
  try {
    let urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Extract meaningful parts from URL path
    let pathParts = pathname.split('/')
      .filter(part => part.length > 2)           // Remove short parts
      .filter(part => !part.match(/^\d+$/))      // Remove pure numbers
      .filter(part => !['www', 'com', 'org', 'net'].includes(part.toLowerCase())) // Remove common parts
      .map(part => part.replace(/[-_]/g, ' '))   // Replace hyphens/underscores with spaces
      .map(part => part.replace(/\.[a-z]+$/i, '')) // Remove file extensions
      .slice(0, 3);  // Take first 3 parts
    
    if (pathParts.length === 0) {
      // Use domain name as fallback
      let domain = urlObj.hostname.replace(/^www\./, '').replace(/\.[a-z]+$/i, '');
      return domain;
    }
    
    return pathParts.join(' ');
    
  } catch (error) {
    return "general discussion";
  }
}

// Format upvote score for display
function formatScore(score) {
  
  if (score >= 10000) {
    return Math.floor(score / 1000) + 'k';
  } else if (score >= 1000) {
    return (score / 1000).toFixed(1) + 'k';
  } else {
    return score.toString();
  }
}

// Format timestamp for display
function formatTime(timestamp) {
  
  if (!timestamp) return 'unknown';
  
  let now = Date.now() / 1000; // Current time in seconds
  let diff = now - timestamp;  // Difference in seconds
  
  if (diff < 3600) { // Less than 1 hour
    let minutes = Math.floor(diff / 60);
    return `${minutes}m ago`;
    
  } else if (diff < 86400) { // Less than 1 day
    let hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
    
  } else if (diff < 2592000) { // Less than 30 days
    let days = Math.floor(diff / 86400);
    return `${days}d ago`;
    
  } else if (diff < 31536000) { // Less than 1 year
    let months = Math.floor(diff / 2592000);
    return `${months}mo ago`;
    
  } else {
    let years = Math.floor(diff / 31536000);
    return `${years}y ago`;
  }
}

// UI Helper functions
function showLoading(show) {
  let loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = show ? 'block' : 'none';
  }
}

function showError(message) {
  let errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function hideError() {
  let errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.style.display = 'none';
  }
}

function clearResults() {
  let resultsDiv = document.getElementById('results');
  if (resultsDiv) {
    resultsDiv.innerHTML = '';
  }
}

function updateSearchModeDisplay(mode, query) {
  let modeDiv = document.getElementById('search-mode');
  if (modeDiv) {
    // Truncate query if too long
    let displayQuery = query.length > 50 ? 
      query.substring(0, 50) + '...' : 
      query;
      
    modeDiv.innerHTML = `
      <div class="search-info">
        <strong>🔍 ${mode}:</strong>
        <span class="query">"${displayQuery}"</span>
      </div>
    `;
  }
}

// Optional: Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
  
  // Press 'S' to switch modes
  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    switchSearchMode();
  }
  
  // Press 'R' to refresh search
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    let currentQuery = getCurrentSearchQuery();
    if (currentQuery) {
      searchReddit(currentQuery);
    }
  }
});

// Get current search query based on mode
function getCurrentSearchQuery() {
  
  switch (currentSearchMode) {
    case 'selected':
      return currentData.selectedText;
    case 'page':
      return currentData.pageTitle;
    case 'url':
      return extractKeywordsFromUrl(currentData.pageUrl);
    default:
      return null;
  }
}

// Optional: Add refresh button functionality
function addRefreshButton() {
  
  let refreshButton = document.createElement('button');
  refreshButton.id = 'refresh-search';
  refreshButton.textContent = '🔄 Refresh';
  refreshButton.className = 'refresh-btn';
  
  refreshButton.addEventListener('click', function() {
    let currentQuery = getCurrentSearchQuery();
    if (currentQuery) {
      searchReddit(currentQuery);
    }
  });
  
  // Insert after search mode display
  let searchModeDiv = document.getElementById('search-mode');
  if (searchModeDiv && searchModeDiv.parentNode) {
    searchModeDiv.parentNode.insertBefore(refreshButton, searchModeDiv.nextSibling);
  }
}
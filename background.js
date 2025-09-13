// Cache for storing recent search results
let searchCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes tak cache stored rehta hai
const MAX_CACHE_SIZE = 50;

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between each requests

// Listen for messages from popup.js with action "amaan ka sandesha"
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {

  console.log("Background received message:", message);

  if (message.action === "amaan_ka_sandesh_for_background_script") {

    // Validate and assign query and other parameters
    let query = message.query ? message.query.trim() : "";
    if (!query) {
      sendResponse({
        success: false,
        error: "Invalid or empty search query"
      });
      return true;
    }

    let limit = message.limit || 10; // Default limit to 10 if not provided
    let sortBy = "relevance"; // Default sorting
    let timePeriod = "all"; // Default time period

    // Create a unique cache key based on query and limit
    let cacheKey = `${query}:${limit}`;

    // Rate limiting check
    let now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
      sendResponse({
        success: false,
        error: "Please wait a moment before searching again"
      });
      return true;
    }
    lastRequestTime = now;

    // Check cache first
    let cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      console.log("Returning cached result for:", query);
      sendResponse({
        success: true,
        data: cachedResult,
        cached: true
      });
      return true;
    }

    // Perform API call if not cached
    performRedditSearch(query, limit, sortBy, timePeriod)
      .then(function(results) {
        console.log(`Found ${results.length} results for: "${query}"`);
        cacheResult(cacheKey, results);
        sendResponse({
          success: true,
          data: results,
          cached: false
        });
      })
      .catch(function(error) {
        console.error("Reddit search failed:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to search Reddit"
        });
      });

    return true; // Keep message channel open for async response
  }

  // Clear cache request
  else if (message.action === "clearCache") {
    searchCache.clear();
    sendResponse({ success: true });
    return true;
  }

  // Get cache info request
  else if (message.action === "getCacheInfo") {
    sendResponse({
      success: true,
      cacheSize: searchCache.size,
      cacheKeys: Array.from(searchCache.keys())
    });
    return true;
  }

  // Unknown action
  else {
    sendResponse({
      success: false,
      error: "Unknown action: " + message.action
    });
    return true;
  }
});

// Main Reddit search function using promises
function performRedditSearch(query, limit, sortBy, timePeriod) {

  return new Promise(function(resolve, reject) {

    let searchURL = buildRedditURL(query, limit, sortBy, timePeriod);
    console.log("Search URL:", searchURL);

    let controller = new AbortController();
    let timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000); // 10 second timeout

    fetch(searchURL, {
      method: "GET",
      headers: {
        "User-Agent": "Reddit Context Helper Extension v1.0"
      },
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Reddit API limit exhausted");
        } else if (response.status === 403) {
          throw new Error("Access denied by Reddit");
        } else if (response.status === 404) {
          throw new Error("Reddit endpoint not found");
        } else {
          throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
        }
      }

      let contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response format");
      }

      return response.json();
    })
    .then(data => {
      if (!data || !data.data || !Array.isArray(data.data.children)) {
        throw new Error("Invalid data structure from Reddit");
      }

      // Format posts and resolve
      let results = data.data.children.map(child => ({
        id: child.data.id,
        title: child.data.title,
        url: `https://reddit.com${child.data.permalink}`,
        subreddit: child.data.subreddit,
        score: child.data.score
      }));
      resolve(results);
    })
    .catch(error => {
      if (error.name === "AbortError") {
        reject(new Error("Request timed out"));
      } else {
        reject(error);
      }
    });
  });
}

// Helper to build the Reddit API URL
function buildRedditURL(query, limit, sortBy, timePeriod) {
  let baseURL = "https://www.reddit.com/search.json";
  let params = new URLSearchParams({
    q: query,
    limit: limit,
    sort: sortBy,
    t: timePeriod,
    type: "link",
    include_over_18: "off"
  });
  return `${baseURL}?${params.toString()}`;
}

// Cache management functions
function getCachedResult(key) {
  let cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    searchCache.delete(key);
    return null;
  }
  return cached.data;
}

function cacheResult(key, data) {
  if (searchCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

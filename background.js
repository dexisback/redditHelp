// HINT: This handles API calls and stays running in background

// Cache for storing recent search results
let searchCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  
  console.log('Background received message:', message);
  
  // Check if this is a Reddit search request
  if (message.action === "searchReddit") {
    
    // Validate message
    if (!message.query || typeof message.query !== 'string') {
      sendResponse({
        success: false,
        error: "Invalid search query"
      });
      return true;
    }
    
    // Get search parameters
    let query = message.query.trim();
    let limit = Math.min(message.limit || 10, 25); // Cap at 25 results
    let sortBy = message.sort || 'relevance';
    let timePeriod = message.time || 'all';
    
    // Check cache first
    let cacheKey = `${query}:${limit}:${sortBy}:${timePeriod}`;
    let cachedResult = getCachedResult(cacheKey);
    
    if (cachedResult) {
      console.log('Returning cached result for:', query);
      sendResponse({
        success: true,
        data: cachedResult,
        cached: true
      });
      return true;
    }
    
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
    
    // Perform Reddit API call
    performRedditSearch(query, limit, sortBy, timePeriod)
      .then(function(results) {
        
        console.log(`Found ${results.length} results for:`, query);
        
        // Cache the results
        cacheResult(cacheKey, results);
        
        // Send successful results back to popup
        sendResponse({
          success: true,
          data: results,
          cached: false
        });
        
      })
      .catch(function(error) {
        
        console.error('Reddit search failed:', error);
        
        // Send error back to popup
        sendResponse({
          success: false,
          error: error.message || "Failed to search Reddit"
        });
      });
    
    // Important: Return true to keep message channel open for async response
    return true;
  }
  
  // Handle other message types
  else if (message.action === "clearCache") {
    searchCache.clear();
    sendResponse({ success: true });
    return true;
  }
  
  else if (message.action === "getCacheInfo") {
    sendResponse({
      success: true,
      cacheSize: searchCache.size,
      cacheKeys: Array.from(searchCache.keys())
    });
    return true;
  }
  
  // Unknown message type
  else {
    sendResponse({
      success: false,
      error: "Unknown action: " + message.action
    });
    return true;
  }
});

// Main Reddit API function
async function performRedditSearch(query, limit, sortBy, timePeriod) {
  
  console.log(`Searching Reddit for: "${query}" (${limit} results, ${sortBy}, ${timePeriod})`);
  
  // Build Reddit search URL
  let searchUrl = buildRedditSearchUrl(query, limit, sortBy, timePeriod);
  console.log('Search URL:', searchUrl);
  
  try {
    
    // Make API call with timeout
    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    let response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Reddit Context Helper Extension v1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Check if request was successful
    if (!response.ok) {
      
      // Handle specific HTTP errors
      if (response.status === 429) {
        throw new Error("Reddit API rate limit exceeded. Please try again later.");
      } else if (response.status === 403) {
        throw new Error("Access denied by Reddit. The content may be restricted.");
      } else if (response.status === 404) {
        throw new Error("Reddit API endpoint not found.");
      } else {
        throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
      }
    }
    
    // Check content type
    let contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error("Invalid response format from Reddit API");
    }
    
    // Parse JSON response
    let data = await response.json();
    
    // Validate response structure
    if (!data || !data.data || !Array.isArray(data.data.children)) {
      throw new Error("Invalid response structure from Reddit API");
    }
    
    // Extract and format the posts we need
    let formattedPosts = formatRedditResponse(data);
    
    return formattedPosts;
    
  } catch (error) {
    
    if (error.name === 'AbortError') {
      throw new Error("Request timed out. Please check your connection.");
    }
    
    console.error('Reddit API error:', error);
    throw error;
  }
}

// Build the Reddit search URL
function buildRedditSearchUrl(query, limit, sortBy, timePeriod) {
  
  // Reddit's JSON API endpoint
  let baseUrl = "https://www.reddit.com/search.json";
  
  // Clean and encode the query
  let cleanQuery = query
    .replace(/[^\w\s-]/g, ' ')     // Remove special chars except hyphens
    .replace(/\s+/g, ' ')          // Multiple spaces to single
    .trim();
  
  // URL parameters
  let params = new URLSearchParams({
    q: cleanQuery,              // Search query
    sort: sortBy,               // "relevance", "hot", "new", "top"
    limit: limit,               // Number of results
    t: timePeriod,              // Time period: "all", "day", "week", "month", "year"
    type: 'link',               // Only get link posts (not users/subreddits)
    include_over_18: 'off'      // Filter out NSFW content by default
  });
  
  return baseUrl + "?" + params.toString();
}

// Format Reddit API response into clean data
function formatRedditResponse(redditResponse) {
  
  // Reddit response structure: data.children[].data
  let posts = redditResponse.data.children || [];
  
  // Extract only the data we need
  let formattedPosts = posts
    .map(function(post) {
      
      let postData = post.data;
      
      // Skip invalid posts
      if (!postData || !postData.title || !postData.permalink) {
        return null;
      }
      
      return {
        id: postData.id,
        title: cleanTitle(postData.title),
        url: `https://reddit.com${postData.permalink}`,
        reddit_url: `https://reddit.com${postData.permalink}`,
        external_url: postData.url !== `https://reddit.com${postData.permalink}` ? postData.url : null,
        subreddit: postData.subreddit,
        subreddit_prefixed: postData.subreddit_name_prefixed,
        score: postData.score || 0,
        upvote_ratio: postData.upvote_ratio || 0,
        created: postData.created_utc || 0,
        author: postData.author,
        selftext_preview: postData.selftext ? 
          cleanAndTruncateText(postData.selftext, 150) : null,
        num_comments: postData.num_comments || 0,
        thumbnail: postData.thumbnail && postData.thumbnail.startsWith('http') ? 
          postData.thumbnail : null,
        is_video: postData.is_video || false,
        domain: postData.domain,
        flair_text: postData.link_flair_text
      };
    })
    .filter(post => post !== null) // Remove invalid posts
    .filter(post => {
      // Filter out deleted/removed posts
      return post.title !== '[deleted]' && 
             post.title !== '[removed]' &&
             post.author !== '[deleted]' &&
             !post.title.toLowerCase().includes('[removed by reddit]');
    })
    .filter(post => {
      // Filter out very low quality posts
      return post.title.length >= 10 && 
             post.score >= -10; // Allow some downvoted posts but not heavily downvoted
    })
    .sort((a, b) => {
      // Sort by relevance score (combination of score and comments)
      let scoreA = a.score + (a.num_comments * 0.5);
      let scoreB = b.score + (b.num_comments * 0.5);
      return scoreB - scoreA;
    });
  
  console.log(`Formatted ${formattedPosts.length} posts from ${posts.length} raw posts`);
  
  return formattedPosts;
}

// Clean post titles
function cleanTitle(title) {
  
  if (!title || typeof title !== 'string') return 'Untitled';
  
  return title
    .replace(/\[OC\]/gi, '')           // Remove [OC] tags
    .replace(/\[Serious\]/gi, '')      // Remove [Serious] tags  
    .replace(/\s+/g, ' ')              // Multiple spaces to single
    .trim();
}

// Clean and truncate text content
function cleanAndTruncateText(text, maxLength) {
  
  if (!text || typeof text !== 'string') return null;
  
  let cleaned = text
    .replace(/\n+/g, ' ')              // Convert newlines to spaces
    .replace(/\s+/g, ' ')              // Multiple spaces to single
    .trim();
  
  if (cleaned.length <= maxLength) return cleaned;
  
  // Truncate at word boundary
  let truncated = cleaned.substring(0, maxLength);
  let lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) { // If we can find a good breaking point
    truncated = truncated.substring(0, lastSpace);
  }
  
  return truncated + '...';
}

// Cache management functions
function getCachedResult(key) {
  
  let cached = searchCache.get(key);
  
  if (!cached) return null;
  
  // Check if cache is expired
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    searchCache.delete(key);
    return null;
  }
  
  return cached.data;
}

function cacheResult(key, data) {
  
  // Implement LRU cache - remove oldest if cache is full
  if (searchCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  
  searchCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

// Cleanup old cache entries periodically
setInterval(() => {
  
  let now = Date.now();
  let keysToDelete = [];
  
  for (let [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => searchCache.delete(key));
  
  if (keysToDelete.length > 0) {
    console.log(`Cleaned up ${keysToDelete.length} expired cache entries`);
  }
  
}, CACHE_DURATION); // Run cleanup every cache duration

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Reddit Context Helper extension started');
  searchCache.clear(); // Clear cache on startup
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  
  if (details.reason === 'install') {
    console.log('Reddit Context Helper extension installed');
    
    // Set default settings
    chrome.storage.sync.set({
      defaultSort: 'relevance',
      defaultLimit: 8,
      showNSFW: false
    });
    
  } else if (details.reason === 'update') {
    console.log('Reddit Context Helper extension updated to version:', chrome.runtime.getManifest().version);
  }
});

// Error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// Periodic health check
setInterval(() => {
  console.log('Background script health check:', {
    cacheSize: searchCache.size,
    lastRequest: lastRequestTime,
    memoryUsage: performance.memory ? {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
    } : 'N/A'
  });
}, 5 * 60 * 1000); // Every 5 minutes
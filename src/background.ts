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

interface CacheEntry {
  data: RedditPost[];
  timestamp: number;
}

let searchCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 50;

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Background received message:", message);

  if (message.action === "amaan_ka_sandesh_for_background_script") {
    let query: string = message.query ? String(message.query).trim() : "";
    if (!query) {
      sendResponse({ success: false, error: "Invalid or empty search query" });
      return true;
    }

    let limit: number = message.limit || 10;
    let sortBy: string = message.sortBy || "relevance";
    let timePeriod: string = message.timePeriod || "all";
    let cacheKey = `${query}:${limit}:${sortBy}:${timePeriod}`;

    let now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
      sendResponse({
        success: false,
        error: "Please wait a moment before searching again",
      });
      return true;
    }
    lastRequestTime = now;

    let cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      console.log("Returning cached result for:", query);
      sendResponse({ success: true, data: cachedResult, cached: true });
      return true;
    }

    performRedditSearch(query, limit, sortBy, timePeriod)
      .then(function (results) {
        console.log(`Found ${results.length} results for: "${query}"`);
        cacheResult(cacheKey, results);
        sendResponse({ success: true, data: results, cached: false });
      })
      .catch(function (error: Error) {
        console.error("Reddit search failed:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to search Reddit",
        });
      });

    return true; // keeps the message channel open so the async fetch above can still call sendResponse
  } else if (message.action === "clearCache") {
    searchCache.clear();
    sendResponse({ success: true });
    return true;
  } else if (message.action === "getCacheInfo") {
    sendResponse({
      success: true,
      cacheSize: searchCache.size,
      cacheKeys: Array.from(searchCache.keys()),
    });
    return true;
  } else {
    sendResponse({
      success: false,
      error: "Unknown action: " + message.action,
    });
    return true;
  }
});

function performRedditSearch(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): Promise<RedditPost[]> {
  return new Promise(function (resolve, reject) {
    let searchURL = buildRedditURL(query, limit, sortBy, timePeriod);
    console.log("Search URL:", searchURL);

    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 10000); // bail out after 10s

    fetch(searchURL, {
      method: "GET",
      headers: { "User-Agent": "Reddit Context Helper Extension v1.0" },
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429)
            throw new Error("Reddit API limit exhausted");
          else if (response.status === 403)
            throw new Error("Access denied by Reddit");
          else if (response.status === 404)
            throw new Error("Reddit endpoint not found");
          else
            throw new Error(
              `Reddit API error: ${response.status} ${response.statusText}`,
            );
        }

        let contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json"))
          throw new Error("Invalid response format");

        return response.json();
      })
      .then((data) => {
        if (!data || !data.data || !Array.isArray(data.data.children))
          throw new Error("Invalid data structure from Reddit");

        let results: RedditPost[] = data.data.children.map((child: any) => ({
          id: child.data.id as string,
          title: child.data.title as string,
          url: `https://reddit.com${child.data.permalink as string}`,
          subreddit: child.data.subreddit as string,
          score: child.data.score as number,
          num_comments: child.data.num_comments as number,
          created_utc: child.data.created_utc as number,
        }));
        resolve(results);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") reject(new Error("Request timed out"));
        else reject(error);
      });
  });
}

function buildRedditURL(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): string {
  let baseURL = "https://www.reddit.com/search.json";
  let params = new URLSearchParams({
    q: query,
    limit: String(limit),
    sort: sortBy,
    t: timePeriod,
    type: "link",
    include_over_18: "off",
  });
  return `${baseURL}?${params.toString()}`;
}

function getCachedResult(key: string): RedditPost[] | null {
  let cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    searchCache.delete(key);
    return null;
  }
  return cached.data;
}

function cacheResult(key: string, data: RedditPost[]): void {
  if (searchCache.size >= MAX_CACHE_SIZE)
    searchCache.delete(searchCache.keys().next().value!); // evict oldest entry
  searchCache.set(key, { data, timestamp: Date.now() });
}

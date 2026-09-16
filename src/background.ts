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

interface TokenData {
  accessToken: string;
  expiresAt: number;
  tokenType?: string;
}

interface RedditCredentials {
  clientId: string;
  clientSecret?: string;
  username?: string;
  password?: string;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 50;

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500;

let cachedToken: TokenData | null = null;

// Optional: default Client ID if using an approved Reddit OAuth App
const DEFAULT_CLIENT_ID: string = "";

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Background received message:", message?.action);

  if (
    message.action === "amaan_ka_sandesh_for_background_script" ||
    message.action === "searchReddit"
  ) {
    const query: string = message.query ? String(message.query).trim() : "";
    if (!query) {
      sendResponse({ success: false, error: "Invalid or empty search query" });
      return true;
    }

    const limit: number = message.limit || 20;
    const sortBy: string = message.sortBy || "relevance";
    const timePeriod: string = message.timePeriod || "all";
    const cacheKey = `${query}:${limit}:${sortBy}:${timePeriod}`;

    const now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
      sendResponse({
        success: false,
        error: "Please wait a moment before searching again",
      });
      return true;
    }
    lastRequestTime = now;

    const cachedResult = getCachedResult(cacheKey);
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

    return true;
  } else if (message.action === "saveRedditCredentials") {
    saveCredentials(message.credentials)
      .then(function () {
        cachedToken = null;
        return chrome.storage.local.remove("redditToken");
      })
      .then(function () {
        return fetchNewToken(message.credentials);
      })
      .then(function (token) {
        cachedToken = token;
        return chrome.storage.local.set({ redditToken: token });
      })
      .then(function () {
        sendResponse({ success: true });
      })
      .catch(function (error: Error) {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (message.action === "checkRedditAuth") {
    checkAuth().then(function (status) {
      sendResponse({
        success: true,
        authenticated: status.authenticated,
        mode: status.mode,
        error: status.error,
      });
    });
    return true;
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

function safeBtoa(str: string): string {
  try {
    return btoa(str);
  } catch {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16)),
      ),
    );
  }
}

function saveCredentials(creds: RedditCredentials): Promise<void> {
  return chrome.storage.local.set({
    redditClientId: creds.clientId ? creds.clientId.trim() : "",
    redditClientSecret: creds.clientSecret ? creds.clientSecret.trim() : "",
    redditUsername: creds.username ? creds.username.trim() : "",
    redditPassword: creds.password || "",
  });
}

function getStoredCredentials(): Promise<RedditCredentials | null> {
  return chrome.storage.local
    .get([
      "redditClientId",
      "redditClientSecret",
      "redditUsername",
      "redditPassword",
    ])
    .then(function (data) {
      if (
        data.redditClientId &&
        typeof data.redditClientId === "string" &&
        data.redditClientId.trim()
      ) {
        return {
          clientId: data.redditClientId.trim(),
          clientSecret: data.redditClientSecret
            ? String(data.redditClientSecret).trim()
            : "",
          username: data.redditUsername
            ? String(data.redditUsername).trim()
            : "",
          password: data.redditPassword ? String(data.redditPassword) : "",
        } as RedditCredentials;
      }

      if (DEFAULT_CLIENT_ID && DEFAULT_CLIENT_ID.trim()) {
        return {
          clientId: DEFAULT_CLIENT_ID.trim(),
          clientSecret: "",
        } as RedditCredentials;
      }

      return null;
    });
}

function getOrCreateDeviceId(): Promise<string> {
  return chrome.storage.local.get("redditDeviceId").then(function (data) {
    if (data.redditDeviceId && typeof data.redditDeviceId === "string") {
      return data.redditDeviceId;
    }
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const deviceId = Array.from(array, (b) =>
      b.toString(16).padStart(2, "0"),
    )
      .join("")
      .substring(0, 24);
    return chrome.storage.local
      .set({ redditDeviceId: deviceId })
      .then(() => deviceId);
  });
}

function fetchNewToken(creds: RedditCredentials): Promise<TokenData> {
  const clientId = creds.clientId ? creds.clientId.trim() : "";
  const clientSecret = creds.clientSecret ? creds.clientSecret.trim() : "";
  const username = creds.username ? creds.username.trim() : "";
  const password = creds.password || "";

  if (!clientId) {
    return Promise.reject(new Error("Client ID is required"));
  }

  const basicAuth = safeBtoa(`${clientId}:${clientSecret}`);
  const userAgent = `chrome-extension:reddit-context-helper:v1.0.0 (by /u/${username || "reddit_context_helper"})`;

  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": userAgent,
  };

  const attemptTokenRequest = (body: URLSearchParams): Promise<any> => {
    return fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: headers,
      body: body.toString(),
    }).then(async function (response) {
      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        if (!response.ok) {
          throw new Error(
            `Reddit API auth error (${response.status}): ${response.statusText}`,
          );
        }
        throw new Error("Invalid response from Reddit auth endpoint");
      }
      return { ok: response.ok, status: response.status, data };
    });
  };

  const processResponseData = (res: {
    ok: boolean;
    status: number;
    data: any;
  }): TokenData => {
    const data = res.data;
    if (data.error) {
      const errorDetail =
        data.message || data.error_description || String(data.error);
      if (data.error === "invalid_grant") {
        throw new Error(
          "Authentication failed (invalid_grant). If your account has 2FA enabled, leave username and password empty and use only Client ID + Client Secret.",
        );
      }
      if (data.error === "unauthorized_client" || res.status === 401) {
        throw new Error(
          "Invalid Client ID or Client Secret. Check your Reddit app credentials.",
        );
      }
      throw new Error(`Reddit auth error: ${errorDetail}`);
    }

    if (!data.access_token) {
      throw new Error("No access token in response from Reddit");
    }

    const expiresMs = (data.expires_in || 3600) * 1000;
    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresMs,
      tokenType: data.token_type || "bearer",
    };
  };

  if (username && password) {
    const passwordBody = new URLSearchParams({
      grant_type: "password",
      username: username,
      password: password,
    });

    return attemptTokenRequest(passwordBody).then(function (res) {
      if (res.data.error === "invalid_grant" && clientSecret) {
        console.warn(
          "Password grant failed, falling back to client_credentials",
        );
        const ccBody = new URLSearchParams({
          grant_type: "client_credentials",
        });
        return attemptTokenRequest(ccBody).then(processResponseData);
      }
      return processResponseData(res);
    });
  } else if (clientSecret) {
    const ccBody = new URLSearchParams({ grant_type: "client_credentials" });
    return attemptTokenRequest(ccBody).then(processResponseData);
  } else {
    return getOrCreateDeviceId().then(function (deviceId) {
      const installedBody = new URLSearchParams({
        grant_type: "https://oauth.reddit.com/grants/installed_client",
        device_id: deviceId,
      });
      return attemptTokenRequest(installedBody).then(processResponseData);
    });
  }
}

function getValidToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return Promise.resolve(cachedToken.accessToken);
  }

  return chrome.storage.local
    .get("redditToken")
    .then(function (data: { [key: string]: any }) {
      const stored = data.redditToken as TokenData | undefined;
      if (
        stored &&
        stored.accessToken &&
        Date.now() < stored.expiresAt - 60000
      ) {
        cachedToken = stored;
        return cachedToken.accessToken;
      }

      return getStoredCredentials()
        .then(function (creds) {
          if (!creds) {
            throw new Error(
              "Reddit API not configured. Using public search feed.",
            );
          }
          return fetchNewToken(creds);
        })
        .then(function (newToken) {
          cachedToken = newToken;
          return chrome.storage.local.set({ redditToken: newToken });
        })
        .then(function () {
          return cachedToken!.accessToken;
        });
    });
}

function checkAuth(): Promise<{
  authenticated: boolean;
  mode: "oauth" | "public";
  error?: string;
}> {
  return getStoredCredentials().then(function (creds): Promise<{
    authenticated: boolean;
    mode: "oauth" | "public";
    error?: string;
  }> | { authenticated: boolean; mode: "oauth" | "public"; error?: string } {
    if (creds && creds.clientId) {
      return getValidToken()
        .then(function () {
          return { authenticated: true, mode: "oauth" as const };
        })
        .catch(function (error: Error) {
          return {
            authenticated: true,
            mode: "public" as const,
            error: error.message,
          };
        });
    }
    return { authenticated: true, mode: "public" as const, error: undefined };
  });
}

function performRedditSearch(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): Promise<RedditPost[]> {
  return getStoredCredentials().then(function (creds) {
    if (creds && creds.clientId) {
      return performOAuthRedditSearch(query, limit, sortBy, timePeriod).catch(
        (err) => {
          console.warn(
            "OAuth search failed, falling back to public RSS feed:",
            err,
          );
          return performPublicRedditSearch(query, limit, sortBy, timePeriod);
        },
      );
    }
    return performPublicRedditSearch(query, limit, sortBy, timePeriod);
  });
}

function performPublicRedditSearch(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): Promise<RedditPost[]> {
  const rssURL = buildRedditRssURL(query, limit, sortBy, timePeriod);
  console.log("Searching Reddit Public Feed:", rssURL);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  return fetch(rssURL, {
    method: "GET",
    signal: controller.signal,
  })
    .then((response) => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Reddit rate limit reached. Please wait a moment.");
        }
        throw new Error(`Reddit public search error (${response.status})`);
      }
      return response.text();
    })
    .then((xmlText) => {
      const results = parseRedditAtomFeed(xmlText);
      return results.slice(0, limit);
    })
    .catch((error: any) => {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Reddit search request timed out");
      }
      throw error;
    });
}

function buildRedditRssURL(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): string {
  const baseURL = "https://www.reddit.com/search.rss";
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(limit, 50)),
    sort: sortBy,
    t: timePeriod,
  });
  return `${baseURL}?${params.toString()}`;
}

function parseRedditAtomFeed(xmlText: string): RedditPost[] {
  const entries: RedditPost[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryBlock = match[1];

    const categoryMatch = /<category\s+term="([^"]+)"/i.exec(entryBlock);
    const subreddit = categoryMatch ? categoryMatch[1].trim() : "reddit";

    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(entryBlock);
    let title = titleMatch ? titleMatch[1] : "Untitled discussion";
    title = unescapeXml(title);

    const linkMatch = /<link\s+href="([^"]+)"/i.exec(entryBlock);
    const url = linkMatch ? linkMatch[1] : "#";

    const idMatch = /<id>([^<]+)<\/id>/i.exec(entryBlock);
    const id = idMatch ? idMatch[1] : String(Math.random());

    if (id.startsWith("t5_") && !url.includes("/comments/")) {
      continue;
    }

    const dateMatch =
      /<(?:published|updated)>([^<]+)<\/(?:published|updated)>/i.exec(
        entryBlock,
      );
    let created_utc = Math.floor(Date.now() / 1000);
    if (dateMatch) {
      const parsedTime = Date.parse(dateMatch[1]);
      if (!isNaN(parsedTime)) {
        created_utc = Math.floor(parsedTime / 1000);
      }
    }

    const contentMatch =
      /<content[^>]*>([\s\S]*?)<\/content>/i.exec(entryBlock);
    let preview: string | undefined = undefined;
    if (contentMatch) {
      const rawHtml = unescapeXml(contentMatch[1]);
      const textOnly = rawHtml
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<a\s+href="[^"]*">\[(?:link|comments)\]<\/a>/gi, "")
        .replace(/submitted by\s+\/u\/[^\s]+\s+to\s+r\/[^\s]+/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (textOnly && textOnly.length > 5) {
        preview =
          textOnly.length > 150 ? textOnly.substring(0, 150) + "..." : textOnly;
      }
    }

    entries.push({
      id,
      title,
      url,
      subreddit,
      score: 0,
      num_comments: 0,
      created_utc,
      selftext_preview: preview,
    });
  }

  return entries;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

function performOAuthRedditSearch(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): Promise<RedditPost[]> {
  return new Promise(function (resolve, reject) {
    getValidToken()
      .then(async function (accessToken) {
        const searchURL = buildRedditURL(query, limit, sortBy, timePeriod);
        console.log("Search URL (OAuth):", searchURL);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
          const creds = await getStoredCredentials();
          const username = creds?.username || "reddit_context_helper";
          const userAgent = `chrome-extension:reddit-context-helper:v1.0.0 (by /u/${username})`;

          const response = await fetch(searchURL, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": userAgent,
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            if (response.status === 401) {
              cachedToken = null;
              await chrome.storage.local.remove("redditToken");
              throw new Error("Reddit auth expired. Please retry your search.");
            } else if (response.status === 429) {
              throw new Error(
                "Reddit API rate limit reached. Please wait a moment.",
              );
            } else if (response.status === 403) {
              throw new Error(
                "Access denied by Reddit (403). Check your app permissions.",
              );
            } else if (response.status === 404) {
              throw new Error("Reddit search endpoint not found.");
            } else {
              throw new Error(
                `Reddit API error: ${response.status} ${response.statusText}`,
              );
            }
          }

          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Invalid response format from Reddit");
          }

          const data = await response.json();
          if (!data || !data.data || !Array.isArray(data.data.children)) {
            throw new Error("Invalid data structure from Reddit");
          }

          const results: RedditPost[] = data.data.children.map(
            (child: any) => {
              const d = child.data || {};
              const permalink = d.permalink
                ? d.permalink.startsWith("/")
                  ? d.permalink
                  : `/${d.permalink}`
                : "";
              let preview: string | undefined = undefined;
              if (
                d.selftext &&
                typeof d.selftext === "string" &&
                d.selftext.trim()
              ) {
                const cleaned = d.selftext.replace(/\s+/g, " ").trim();
                preview =
                  cleaned.length > 150
                    ? cleaned.substring(0, 150) + "..."
                    : cleaned;
              }

              return {
                id: d.id ? String(d.id) : String(Math.random()),
                title: d.title ? String(d.title) : "Untitled discussion",
                url: permalink
                  ? `https://www.reddit.com${permalink}`
                  : d.url || "#",
                subreddit: d.subreddit ? String(d.subreddit) : "all",
                score: typeof d.score === "number" ? d.score : 0,
                num_comments:
                  typeof d.num_comments === "number" ? d.num_comments : 0,
                created_utc:
                  typeof d.created_utc === "number"
                    ? d.created_utc
                    : Math.floor(Date.now() / 1000),
                selftext_preview: preview,
              };
            },
          );

          resolve(results);
        } catch (error: any) {
          clearTimeout(timeoutId);
          if (error.name === "AbortError") {
            reject(new Error("Search request timed out"));
          } else {
            reject(error);
          }
        }
      })
      .catch(reject);
  });
}

function buildRedditURL(
  query: string,
  limit: number,
  sortBy: string,
  timePeriod: string,
): string {
  const baseURL = "https://oauth.reddit.com/search";
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(limit, 100)),
    sort: sortBy,
    t: timePeriod,
    type: "link",
    include_over_18: "off",
    raw_json: "1",
  });
  return `${baseURL}?${params.toString()}`;
}

function getCachedResult(key: string): RedditPost[] | null {
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    searchCache.delete(key);
    return null;
  }
  return cached.data;
}

function cacheResult(key: string, data: RedditPost[]): void {
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
  searchCache.set(key, { data, timestamp: Date.now() });
}

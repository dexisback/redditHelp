let pageTitle = "";
let metaDescription = "";

const commonStopWords: string[] = [
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
  "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
  "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs",
  "themselves", "what", "which", "who", "whom", "this", "that", "these", "those",
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if",
  "or", "because", "as", "until", "while", "of", "at", "by", "for", "with",
  "about", "against", "between", "into", "through", "during", "before", "after",
  "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "when", "where",
  "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "s", "t", "can", "will", "just", "don", "should", "now",
];

function cleanupTitle(anything: string): string {
  if (!anything) return "";

  const cleanedText = anything
    .replace(/[^\w\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

  return cleanedText
    .split(" ")
    .filter((item) => item.length > 2 && !commonStopWords.includes(item))
    .slice(0, 6)
    .join(" ");
}

function getSelectedText(): string {
  return (window.getSelection()?.toString() ?? "").trim();
}

function pageInfoGatherer(): void {
  pageTitle = document.title;
  const metaTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaTag) metaDescription = metaTag.content;

  const currentSelection = getSelectedText();
  chrome.storage.local.set({
    pageTitle: cleanupTitle(pageTitle),
    rawPageTitle: pageTitle,
    metaDescription,
    pageUrl: window.location.href,
    selectedText: currentSelection || undefined,
    hasSelection: Boolean(currentSelection),
  });
}

// Track mouseup / text selections
document.addEventListener("mouseup", () => {
  const selectedText = getSelectedText();
  if (selectedText) {
    chrome.storage.local.set({ selectedText, hasSelection: true });
  } else {
    chrome.storage.local.set({ hasSelection: false });
  }
});

// Provide live page data to the popup when requested
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageInfo") {
    const selectedText = getSelectedText();
    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const desc = metaTag ? metaTag.content : "";
    const title = document.title || "";

    sendResponse({
      pageTitle: cleanupTitle(title),
      rawTitle: title,
      metaDescription: desc,
      pageUrl: window.location.href,
      selectedText: selectedText || undefined,
    });
    return false;
  }
});

// Initialize on page load or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", pageInfoGatherer);
  window.addEventListener("load", pageInfoGatherer);
} else {
  pageInfoGatherer();
}

// Watch for SPA URL changes (e.g. YouTube, GitHub, Twitter)
let currentUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    pageInfoGatherer();
  }
}, 1000);

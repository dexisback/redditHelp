let pageTitle = "";
let metaDescription = ""; // outer scope so both pageInfoGatherer and the SPA watcher can write/read these

document.addEventListener("mouseup", selectFunction);

function selectFunction(): void {
  let selectedText = (window.getSelection()?.toString() ?? "").trim();
  if (selectedText) {
    chrome.storage.local.set({ selectedText, hasSelection: true });
  }
}

window.addEventListener("load", pageInfoGatherer);

function pageInfoGatherer(): void {
  pageTitle = document.title;
  let metaTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaTag) metaDescription = metaTag.content;

  chrome.storage.local.set({
    pageTitle: cleanupTitle(pageTitle),
    metaDescription,
    pageUrl: window.location.href,
  });
}

function cleanupTitle(anything: string): string {
  if (!anything) return "";

  let cleanedText = anything
    .replace(/[^\w\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

  let commonStopWords: string[] = [
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
  ]; // via https://gist.github.com/sebleier/554280

  return cleanedText
    .split(" ")
    .filter((item) => item.length > 2 && !commonStopWords.includes(item))
    .slice(0, 6)
    .join(" ");
}

let currentUrl = window.location.href;

setInterval(() => {
  // sites like YouTube change the URL without a full page reload, so we poll for it
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    pageTitle = document.title;
    chrome.storage.local.set({
      pageTitle: cleanupTitle(pageTitle),
      pageUrl: currentUrl,
      hasSelection: false, // clear any prior text selection when the user navigates away
    });
  }
}, 1000);

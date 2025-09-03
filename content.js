// HINT: This file detects user interactions on websites

// Listen for text selection
document.addEventListener('mouseup', function() {
  
  // Get selected text
  let selectedText = window.getSelection().toString().trim();
  
  // If user selected something
  if (selectedText.length > 0) {
    
    // Store it for popup to use later
    chrome.storage.local.set({ 
      selectedText: selectedText,
      hasSelection: true 
    });
    
    // Optional: Show visual feedback
    console.log("Saved selected text:", selectedText);
  }
});

// Also get page information when page loads
window.addEventListener('load', function() {
  
  // Extract page title
  let pageTitle = document.title;
  
  // Extract meta description (if exists)
  let metaDescription = "";
  let metaTag = document.querySelector('meta[name="description"]');
  if (metaTag) {
    metaDescription = metaTag.content;
  }
  
  // Clean up title (remove extra words, special chars)
  let cleanTitle = cleanTextForSearch(pageTitle);
  
  // Store page context
  chrome.storage.local.set({
    pageTitle: cleanTitle,
    pageUrl: window.location.href,
    metaDescription: metaDescription
  });
});

// Helper function to clean text for search
function cleanTextForSearch(text) {
  
  // Step 1: Remove special characters and normalize
  let cleanedText = text
    .replace(/[^\w\s-]/gi, ' ')     // Remove special chars except hyphens
    .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
    .toLowerCase()                   // Convert to lowercase
    .trim();                        // Remove leading/trailing spaces
  
  // Step 2: Define common stop words to remove
  let stopWords = [
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'a', 'an', 'it', 'its', 'they', 'them', 'their', 'there', 'here',
    'how', 'what', 'when', 'where', 'why', 'who', 'which'
  ];
  
  // Step 3: Split into words and filter
  let words = cleanedText.split(' ')
    .filter(word => {
      return word.length > 2 &&              // Keep words longer than 2 chars
             !stopWords.includes(word) &&    // Remove stop words
             !word.match(/^\d+$/);            // Remove pure numbers
    });
  
  // Step 4: Limit to first 5 meaningful words
  let finalWords = words.slice(0, 5);
  
  // Step 5: Return cleaned search query
  return finalWords.join(' ');
}

// Optional: Clear selection flag when user clicks elsewhere
document.addEventListener('click', function() {
  
  // Small delay to check if there's still selection
  setTimeout(() => {
    let currentSelection = window.getSelection().toString().trim();
    
    if (currentSelection.length === 0) {
      // No text selected anymore, clear the flag
      chrome.storage.local.set({ 
        hasSelection: false 
      });
    }
  }, 100);
});

// Optional: Handle page URL changes (for SPAs)
let currentUrl = window.location.href;
setInterval(() => {
  
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    
    // Page changed, update page info
    let cleanTitle = cleanTextForSearch(document.title);
    chrome.storage.local.set({
      pageTitle: cleanTitle,
      pageUrl: currentUrl,
      hasSelection: false  // Reset selection on page change
    });
  }
}, 1000);  // Check every second



// More advanced text cleaning
function advancedTextCleaning(text) {
  
  // Remove common website suffixes
  let cleanedText = text
    .replace(/\s*-\s*(YouTube|Google|Facebook|Twitter|Reddit).*$/i, '')
    .replace(/\s*\|\s*.*$/, '')     // Remove everything after |
    .replace(/\s*::\s*.*$/, '')     // Remove everything after ::
    .replace(/^\[.*?\]\s*/, '');    // Remove [tags] at beginning
  
  return cleanTextForSearch(cleanedText);
}

// Extract keywords from URL if title is not useful
function extractKeywordsFromUrl(url) {
  
  try {
    let urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Extract meaningful parts from URL path
    let pathParts = pathname.split('/')
      .filter(part => part.length > 2)     // Remove short parts
      .filter(part => !part.match(/^\d+$/)) // Remove pure numbers
      .map(part => part.replace(/-|_/g, ' ')) // Replace hyphens/underscores
      .slice(0, 3);  // Take first 3 parts
    
    return pathParts.join(' ');
    
  } catch (error) {
    return 'general discussion';
  }
}

// Get text content from specific elements (for better context)
function getPageContext() {
  
  // Try to get meaningful content from page
  let contexts = [];
  
  // Check for article headlines
  let h1 = document.querySelector('h1');
  if (h1) contexts.push(h1.textContent);
  
  // Check for meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords) contexts.push(metaKeywords.content);
  
  // Get first paragraph text (if it's not too long)
  let firstParagraph = document.querySelector('p');
  if (firstParagraph && firstParagraph.textContent.length < 200) {
    contexts.push(firstParagraph.textContent);
  }
  
  // Combine and clean all contexts
  let combinedContext = contexts.join(' ');
  return cleanTextForSearch(combinedContext);
}



//my own code:
document.addEventListener("mouseup", selectFunction);
//define the select function, what happens when the text is selected

function selectFunction(){
    let selectedText=window.getSelection().toString().trim();
    if(selectedText){
        //store it in the chrome storage API;
        chrome.storage.local.set({
            selectedText: selectedText,
            hasSelection: true //just a flag for checking
        })                        
    }
    //and for a checking, we will print out something in the console
    console.log(`The selected text is ${selectedText}`);

}

//now since humara model is hybrid one, it also sends the page data to the user, we have to first fetch and store the data of the page 
window.addEventListener("load", pageInfoGatherer);


function pageInfoGatherer(){
    //gathers the metadata, the page title, and the url
    let pageTitle=document.title; //the page title
    let metaDescription; //definining metadescription
    let metaTag=document.querySelector('meta[name="description"]')    //ig this fetches the metaTag of the page
    if(metaTag){  //if metatag exists, then store it in the chrome storage API
       metaDescription= metaTag.content; 
    }
}

//time to clean up the title:
let cleanedTitle=cleanupTitle(pageTitle)  //this is the cleanedTitle, cleaned up using a self made function =>cleanupTitle

//since everything is done and set, now we store the things into the chrome storage API:
chrome.storage.local.set({
    pageTitle: pageTitle,
    metaDescription: metaDescription,
    pageUrl:window.location.href
})


//defining the function:
function cleanupTitle(anything){
   
    let cleanedText=anything
    .replace(/[^\w\s-]/gi,' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

    //define common stopwords to remove(taken from https://gist.github.com/sebleier/554280 thanks)
    let commonStopWords=["i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"]
    
    //split the given sentence into different words, and check if that word is a commonStopWord, and filter it out
    let usefulWords= cleanedText.split(' ').filter(item=>{
        return item.length>2 && !commonStopWords.includes(item);  //this line we are removing all the words that are less than 2 characters of length, and any word that includes commonStopWords wali array me se kuch bhi
    });

    //we will only give the first 6/7 words to the API, usse zyaada not needed i think
    let finalWords=usefulWords.slice(0,6);
    return finalWords.join(' '); //useful words was an array of letters sepearated together by a whitespace(words basically), we are joining them back to form a coherent sentence (string) to send out

}



//url change detection for SPAs(sites like youtube vgrh does itm without reloading the page the URL changes)
let currentUrl=window.location.href;
setInterval(()=>{
    if(window.location.href !== currentUrl){
        currentUrl=window.location.href;
    }

    //since page has changed we also need to update the pageInfo
    let cleanedTitle=cleanupTitle(pageTitle);
    chrome.storage.local.set({
        pageTitle: cleanedTitle,
        pageUrl: currentUrl,
        hasSelection: false
    })
}, 1000);  //we are doing this checking every second





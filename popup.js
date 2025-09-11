// //my own code:

// let currentSearchMode="auto";
// let searchQuery="";
// let curretnData={};


// //when DOM is loaded up
// window.addEventListener("DOMContentLoaded", function(){
//   chrome.storage.local.get([
//     'pageTitle',
//     'metaDescription',
//     'pageUrl',
//     'selectedText'],function(data){ //callback function
//       if(data.selectedText){
//         searchQuery=data.selectedText;
//         currentSearchMode="selected text"
//       }
//       else if(data.pageTitle){
//         searchQuery=data.pageTitle;
//         currentSearchMode="page title"
//       }
//       else{
//         //store the pageUrl because i wanna use it
//         storedUrlLocally=data.pageUrl
//         searchQuery=urlKeywordsExtractor(storedUrlLocally);
//         currentSearchMode="page Url"
//       }
//        searchReddit(searchQuery);
//     }

//     //the getting is performed and the functions are performed
    
//   );


//   function searchReddit(query){
//     if(!query){
//       showError(`sorry lmao`);
//       return;
//     }
//     else{
//       //send the message to radar for someone(background script to catch):
//       chrome.runtime.sendMessage({
//         action:"amaan_ka_sandesh_for_background_script",
//         query: query.trim(),
//         limit: 8 
//       }, function(response){ //choose what we do with the response
//         loadingScreen(false); //hide loading screen;
//         if(chrome.runtime.lastError){
//           showError(`lmao square`);
//           return;
//         }
//         else if(response){ //else if response does actually exists
//           //show the response.data in our display:
//           displayResults(response.data);
//         }
//       })
//       }
//     }
  
//     function urlKeywordsExtractor(storedUrlLocally){
//       if (!url) return "general discussion";
  
//     try {
//         //https://example.com/learn/programming/javascript/react/hooks
//         //https://shop.com/products/iphone15/review
//         let urlObj = new URL(url);
//         let pathParts = urlObj.pathname.split("/") 
//           .filter(part => part.length > 2)   
//           // .filter(part => !part.match(/^\d+$/)) 
//           .map(part => part.replace(/[-_]/g, " "))
//           .slice(0, 7);

//         if (pathParts.length === 0) {
//           return urlObj.hostname.replace(/^www\./, "");
//         }
//         return pathParts.join(" ");
//     } 

//     catch (err) {
//       return "general discussion";
//     }
// }









   
// });


  





console.log("Amaan");
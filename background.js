
//my own code:
// Listens to search requests from the popup.
// Queries the Reddit API to fetch posts based on search parameters.
// Caches results to reduce redundant API calls.
// Implements rate limiting to prevent too many requests in a short time.
// Handles errors and cleans up old data periodically.

let searchCache= new Map();
const CACHE_DURATION=5*60*1000; //5 minutes tak cache stored rehta hai
const MAX_CACHE_SIZE= 50;

//do rate limiting:`

//listen for messages from the popup.js with action amaan ka sandesha, and then assign some query variable as the received query, set a limit variable or set the variable by yourself if its not received(use sortBy or timePeriod but not neccesary)

//create a unique cache key which checks if the previous cached_key was the same as this one, if this was then it means we dont need to send the whole request again, just return the previous thing


//create a rate limiting check, this prevents the user from sending too many request at a time

//call the reddit API using a function we made(we send the query, limit, sortBy, timePeriod in this query)


//actual thing:
  //defining the function we made to perform the reddit API call
  //this gonna be an async task, so the whole thing gotta be an asyc function
  //type the base url
  //define the paramURL
  //create a timeout to cancel the request if it takes more than 10 seconds to fetch
  //check for error status codes like 429, 403, 404,etc

  //processing the received values:
    //parse the JSON
    //format posts into clean objects using a cleanformatter function we make custom later on
    //and return the final thing
  

//function cleanFormatter
//periodicly clean the cache




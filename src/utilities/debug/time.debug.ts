import { VerboseLogging } from "../logging/verbose.logging";


let timeOfPrev = Date.now();
let msgOfPrev : string = "Start";

export function logTimeSince(message : string, metadata : string = ""){
    if( 1 == 1 )
        return;

    let now = Date.now(); 
    VerboseLogging.info("LOGTIME: "+ now +" || In " + message + ", time since " + msgOfPrev + " is " + (now - timeOfPrev) + ". metadata: " + metadata);

    timeOfPrev = now;
    msgOfPrev = message;
}
import { Http3Client } from "./http3.client";
import { Http3ClientEvent } from "./http3.client.events";
import { Bignum } from "../../../types/bignum";
import { Http3Message } from "../common/http3.message";
import { Http3Header } from "../common/qpack/types/http3.header";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { Http3ResourceParser, Http3ResourceParserEvent } from "./http3.resourceparser";
import { Constants } from "../../../utilities/constants";
import { readFileSync } from "fs";
import { Http3RequestMetadata } from "./http3.requestmetadata";
import { start } from "repl";

// Constants.QLOG_FILE_NAME = process.argv[2];
// const logFileName: string | undefined = process.argv[3] || undefined;
// if (logFileName !== undefined) {
//     Constants.LOG_FILE_NAME = logFileName;
// }
// const lookupTableFileName: string | undefined = process.argv[4] || undefined;
// const lookupTable: {config: {}, resources: {[path: string]: Http3RequestMetadata}} | undefined = lookupTableFileName === undefined ? undefined : JSON.parse(readFileSync(lookupTableFileName, "utf-8"));


// let host = process.argv[5] || "0.0.0.0";
// let port = parseInt(process.argv[6]) || 4433;
// const authority: string = host + ":" + port
// let version = process.argv[7] || Constants.getActiveVersion(); // pass "deadbeef" to force version negotiation


let host = process.argv[2] || "0.0.0.0";
let port = parseInt(process.argv[3]) || 4433;
const authority: string = host + ":" + port
let version = process.argv[4] || Constants.getActiveVersion(); // pass "deadbeef" to force version negotiation

const lookupTableFileName = undefined;
const lookupTable:any = undefined;

let startedRequestCount:number = 0;
let finishedRequestCount:number = 0;

const client: Http3Client = new Http3Client(host, port);

client.on(Http3ClientEvent.CLIENT_CONNECTED, () => {
    // Default behaviour: 
    // Request file and scan for related resources if HTML or JS
    if (lookupTable === undefined) {
        const resourceParser: Http3ResourceParser = new Http3ResourceParser();
        resourceParser.on(Http3ResourceParserEvent.FILES_FOUND, (fileList: string[]) => {
            VerboseLogging.info("HTTP/3 Resource parser found new resources");
            for (const file of fileList) {
                VerboseLogging.info("Requesting newly found resource: " + file);
                ++startedRequestCount;
                client.get(file, authority);
            }
        });

        client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, response: Http3Message) => {
            const headers: Http3Header[] = response.getHeaderFrame().getHeaders();
            const payload: Buffer = response.getPayload();
            const headerStrings: string[][] = headers.map((header) => {
                return [header.name, header.value];
            });
    
            console.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));
            VerboseLogging.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));

            const mimeType: string | undefined = response.getHeaderFrame().getHeaderValue("Content-Type");
            if (mimeType !== undefined) {
                resourceParser.parseBuffer(payload, mimeType);
            }
            ++finishedRequestCount;

            if( finishedRequestCount === startedRequestCount ){
                VerboseLogging.info("All requests are fully done, ending this test run " + finishedRequestCount + " === " + startedRequestCount );
                client.DEBUGgetQUICClient()!.close("'Well, I'm back,' he said.");
                client.DEBUGgetQlogger()!.close(); // nicely end our qlog json output
                
                setTimeout( () => {
                    VerboseLogging.error("Exiting process with code 66");
                    console.log("Exiting process with code 66");
                    process.exit(66);
                }, 500);
            }

        });

        ++startedRequestCount;
        client.get("/index_with_subresources.html", authority, 16);
    } 
    // using the hardcoded lookup table for synthetic testing 
    else {
        client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, response: Http3Message) => {
            const headers: Http3Header[] = response.getHeaderFrame().getHeaders();
            const payload: Buffer = response.getPayload();
            const headerStrings: string[][] = headers.map((header) => {
                return [header.name, header.value];
            });
    
            console.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));
            VerboseLogging.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));
    
            if( !lookupTable.resources[path] ){
                VerboseLogging.error("Path does not exist! "  + JSON.stringify(lookupTable.resources, null, 4) + ":" + path);       
                process.exit(666);
            }
            else{
                const relatedResources: string[] | undefined = lookupTable.resources[path].childrenEnd;
                if (relatedResources !== undefined) {
                    for (const resource of relatedResources) {
                        const metadata: Http3RequestMetadata = lookupTable.resources[resource];
                        if (metadata.deltaStartTime !== undefined) {
                            ++startedRequestCount;
                            setTimeout(() => {
                                client.get(resource, authority, undefined, metadata);
                            }, metadata.deltaStartTime);
                        } else {
                            VerboseLogging.error("democlient: lookuptable resource had undefined deltaStartTime " + resource);
                            ++startedRequestCount;
                            client.get(resource, authority, undefined, metadata);
                        }
                    }
                }
            }

            ++finishedRequestCount;
            if( finishedRequestCount === startedRequestCount ){
                VerboseLogging.info("All requests are fully done, ending this test run " + finishedRequestCount + " === " + startedRequestCount + " === " + Object.keys(lookupTable.resources).length );
                client.DEBUGgetQlogger()!.close(); // nicely end our qlog json output
                client.DEBUGgetQUICClient()!.close();
                
                setTimeout( () => {
                    VerboseLogging.error("Exiting process with code 66");
                    console.log("Exiting process with code 66");
                    process.exit(66);
                }, 500);
            }
        });

        const firstRequest: string = Object.keys(lookupTable.resources)[0];
        ++startedRequestCount;
        client.get(firstRequest, authority, undefined, lookupTable.resources[firstRequest]);

        // Resources discovered during transmission of its parent (found while parsing the chunks as they arrive)
        const relatedResources: string[] | undefined = lookupTable.resources[firstRequest].childrenStart;
        if (relatedResources !== undefined) {
            for (const resource of relatedResources) {
                // Based on the metadata of each resource, set a delay with which it should be fetched
                const metadata: Http3RequestMetadata = lookupTable.resources[resource];
                if (metadata.deltaStartTime !== undefined) {
                    ++startedRequestCount;
                    setTimeout(() => {
                        client.get(resource, authority, undefined, metadata);
                    }, metadata.deltaStartTime);
                } else {
                    VerboseLogging.error("democlient: lookuptable resource had undefined deltaStartTime " + resource);
                    ++startedRequestCount;
                    client.get(resource, authority, undefined, metadata);
                }
            }
        }
    }
});

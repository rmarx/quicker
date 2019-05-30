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

Constants.QLOG_FILE_NAME = process.argv[2];
const logFileName: string | undefined = process.argv[3] || undefined;
if (logFileName !== undefined) {
    Constants.LOG_FILE_NAME = logFileName;
}
const lookupTableFileName: string | undefined = process.argv[4] || undefined;
const lookupTable: {config: {}, resources: {[path: string]: Http3RequestMetadata}} | undefined = lookupTableFileName === undefined ? undefined : JSON.parse(readFileSync(lookupTableFileName, "utf-8"));


let host = process.argv[5] || "127.0.0.1";
let port = parseInt(process.argv[6]) || 4433;
let version = process.argv[7] || Constants.getActiveVersion(); // pass "deadbeef" to force version negotiation

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
                client.get(file);
            }
        });

        client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, response: Http3Message) => {
            const headers: Http3Header[] = response.getHeaderFrame().getHeaders();
            const payload: Buffer = response.getPayload();
            const headerStrings: string[][] = headers.map((header) => {
                return [header.name, header.value];
            });
    
            console.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));
    
            const mimeType: string | undefined = response.getHeaderFrame().getHeaderValue("Content-Type");
            if (mimeType !== undefined) {
                resourceParser.parseBuffer(payload, mimeType);
            }
        });

        client.get("/index.html", 16);
    } else {
        client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, response: Http3Message) => {
            const headers: Http3Header[] = response.getHeaderFrame().getHeaders();
            const payload: Buffer = response.getPayload();
            const headerStrings: string[][] = headers.map((header) => {
                return [header.name, header.value];
            });
    
            console.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));
    
            const relatedResources: string[] | undefined = lookupTable.resources[path].childrenEnd;
            if (relatedResources !== undefined) {
                for (const resource of relatedResources) {
                    const metadata: Http3RequestMetadata = lookupTable.resources[resource];
                    if (metadata.deltaStartTime !== undefined) {
                        setTimeout(() => {
                            client.get(resource, undefined, metadata);
                        }, metadata.deltaStartTime);
                    } else {
                        client.get(resource, undefined, metadata);
                    }
                }
            }
        });

        const firstRequest: string = Object.keys(lookupTable.resources)[0];
        client.get(firstRequest, undefined, lookupTable.resources[firstRequest]);

        // Resources discovered during transmission of its parent (found while parsing the chunks as they arrive)
        const relatedResources: string[] | undefined = lookupTable.resources[firstRequest].childrenStart;
        if (relatedResources !== undefined) {
            for (const resource of relatedResources) {
                // Based on the metadata of each resource, set a delay with which it should be fetched
                const metadata: Http3RequestMetadata = lookupTable.resources[resource];
                if (metadata.deltaStartTime !== undefined) {
                    setTimeout(() => {
                        client.get(resource, undefined, metadata);
                    }, metadata.deltaStartTime);
                } else {
                    client.get(resource, undefined, metadata);
                }
            }
        }
    }
});

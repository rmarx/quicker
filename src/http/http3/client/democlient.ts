import { Http3Client } from "./http3.client";
import { Http3ClientEvent } from "./http3.client.events";
import { Bignum } from "../../../types/bignum";
import { Http3Message } from "../common/http3.message";
import { Http3Header } from "../common/qpack/types/http3.header";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { Http3ResourceParser, Http3ResourceParserEvent } from "./http3.resourceparser";

const client: Http3Client = new Http3Client("127.0.0.1", 4433);

client.on(Http3ClientEvent.CLIENT_CONNECTED, () => {
    // const resourceParser: Http3ResourceParser = new Http3ResourceParser();
    // resourceParser.on(Http3ResourceParserEvent.FILES_FOUND, (fileList: string[]) => {
    //     VerboseLogging.info("HTTP/3 Resource parser found new resources");
    //     for (const file of fileList) {
    //         VerboseLogging.info("Requesting newly found resource: " + file);
    //         client.get(file);
    //     }
    // });

    // client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, response: Http3Message) => {
    //     const headers: Http3Header[] = response.getHeaderFrame().getHeaders();
    //     const payload: Buffer = response.getPayload();
    //     const headerStrings: string[][] = headers.map((header) => {
    //         return [header.name, header.value];
    //     });

    //     console.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));

    //     const mimeType: string | undefined = response.getHeaderFrame().getHeaderValue("Content-Type");
    //     if (mimeType !== undefined) {
    //         resourceParser.parseBuffer(payload, mimeType);
    //     }
    // });

    // const rootRequest: Bignum = client.get("/index.html", 16);
    // client.get("/script.js", 1, rootRequest);
    // client.get("/QUIC_lowres.png", 4, rootRequest);
    // client.get("/high_priority.png", 64, rootRequest); // Returns notfound.html
    // setTimeout(() => {
    //     client.get("/high_priority.png"); // Returns notfound.html
    // }, 1000);
});

import { Http3Client } from "./http3.client";
import { Http3ClientEvent } from "./http3.client.events";
import { Bignum } from "../../../types/bignum";
import { Http3Message } from "../common/http3.message";
import { Http3Header } from "../common/qpack/types/http3.header";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";

const client: Http3Client = new Http3Client("127.0.0.1", 4433);

client.on(Http3ClientEvent.CLIENT_CONNECTED, () => {
    client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, response: Http3Message) => {
        const headers: Http3Header[] = response.getHeaderFrame().getHeaders();
        const payload: Buffer = response.getPayload();
        const headerStrings: string[][] = headers.map((header) => {
            return [header.name, header.value];
        });

        VerboseLogging.info("HTTP3 response on path '" + path + "'\nHeaders: " + headerStrings + "\nContent:\n" + payload.toString("utf8"));
    });

    const rootRequest: Bignum = client.get("/", 16);
    client.get("/script.js", 1, rootRequest);
    client.get("/QUIC_lowres.png", 4, rootRequest);
    // client.get("/high_priority.png", 64, rootRequest); // Returns notfound.html
    setTimeout(() => {
        client.get("/high_priority.png"); // Returns notfound.html
        client.close();
    }, 1000);
});

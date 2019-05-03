import { Http3Client } from "./http3.client";
import { Http3ClientEvent } from "./http3.client.events";
import { Bignum } from "../../../types/bignum";

const client: Http3Client = new Http3Client("127.0.0.1", 4433);

client.on(Http3ClientEvent.CLIENT_CONNECTED, () => {
    client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, responseData: Buffer) => {
        console.log("HTTP3 RESPONSE ON PATH '" + path + "':\n" + responseData.toString("utf8"));
    });
    const rootRequest: Bignum = client.get("/", 16);
    client.get("/script.js", 1, rootRequest);
    client.get("/image.jpg", 4, rootRequest);
    client.get("/high_priority.png", 64, rootRequest); // Returns notfound.html
    // setTimeout(() => {
    //     client.get("late_request");
    //     client.close();
    // }, 1000);
});

import { Http3Client } from "./http3.client";
import { Http3ClientEvent } from "./http3.client.events";

const client: Http3Client = new Http3Client("127.0.0.1", 4433);

client.on(Http3ClientEvent.CLIENT_CONNECTED, () => {
    client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, responseData: Buffer) => {
        console.log("HTTP3 RESPONSE ON PATH '" + path + "':\n" + responseData.toString("utf8"));
    });
    client.get("/", 16);
    client.get("low_priority", 1)
    client.get("high_priority", 64);
    // setTimeout(() => {
    //     client.get("late_request");
    //     client.close();
    // }, 1000);
});

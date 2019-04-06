import { Http3Client } from "./http3.client";
import { Http3ClientEvent } from "./http3.client.events";

const client: Http3Client = new Http3Client("127.0.0.1", 4433);

client.on(Http3ClientEvent.CLIENT_CONNECTED, () => {
    client.on(Http3ClientEvent.RESPONSE_RECEIVED, (path: string, responseData: Buffer) => {
        console.log("HTTP3 RESPONSE ON PATH '" + path + "':\n" + responseData.toString("utf8"));
    });
    client.get("/");
    client.get("test");
    client.get("test2");
    client.get("foo");
    client.get("bar");
    setTimeout(() => {
        client.get("late_request");
        client.close();
    }, 1000);
});

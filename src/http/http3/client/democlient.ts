import { Http3Client } from "./http3.client";

const client: Http3Client = new Http3Client("localhost", 4433);

client.get("/");
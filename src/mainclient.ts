import { Client } from "./quicker/client";

var client = new Client();
client.connect('nghttp2.org',4433);
client.testSend();
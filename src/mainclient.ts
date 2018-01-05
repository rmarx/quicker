import { Client } from "./quicker/client";

var client = new Client();
client.connect('localhost',4433);
client.testSend();
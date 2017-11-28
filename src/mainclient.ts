import { Client } from "./quicker/client";


var client = new Client();
client.connect('localhost',10000);
client.testSend();
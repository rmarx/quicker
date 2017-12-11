import { Client } from "./quicker/client";


var client = new Client();
client.connect('localhost',4433);
console.log("test send");
client.testSend();
console.log("test send done");
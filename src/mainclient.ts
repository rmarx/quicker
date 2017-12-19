import { Client } from "./quicker/client";
import { AEAD } from "./crypto/aead";
import { ConnectionID } from "./packet/header/base.header";
import { EndpointType } from "./quicker/type";


var client = new Client();
client.connect('localhost',4433);
console.log("test send");
client.testSend();
console.log("test send done");
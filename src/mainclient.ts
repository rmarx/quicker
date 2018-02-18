import { Client } from "./quicker/client";

if (process.argv.length < 4) {
    console.log("not enough arguments specified: node ./mainclient.js 127.0.0.1 4433");
    process.exit(-1);
}
if (isNaN(Number(process.argv[3]))) {
    console.log("port must be a number: node ./mainclient.js 127.0.0.1 4433");
    process.exit(-1);
}

var client = new Client();
client.connect(process.argv[2], Number(process.argv[3]));
client.testSend();
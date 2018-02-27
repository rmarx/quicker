import { Client } from "./quicker/client";
import { HttpHelper } from "./http/http0.9/http.helper";
import { QuicStream } from "./quicker/quic.stream";

if (process.argv.length < 4) {
    console.log("not enough arguments specified: node ./mainclient.js 127.0.0.1 4433");
    process.exit(-1);
}
if (isNaN(Number(process.argv[3]))) {
    console.log("port must be a number: node ./mainclient.js 127.0.0.1 4433");
    process.exit(-1);
}

var httpHelper = new HttpHelper();
var client = Client.connect(process.argv[2], Number(process.argv[3]));
client.on('connected', () => {
    var quicStream: QuicStream = client.request(httpHelper.createRequest("index.html"));
    var bufferedData = Buffer.alloc(0);
    quicStream.on('data', (data: Buffer) => {
        bufferedData = Buffer.concat([bufferedData, data]);
    });

    quicStream.on('end', () => {
        console.log(bufferedData.toString('utf8'));
    });
});

client.on('error', (error: Error) => {
    console.log("error");
    console.log(error.message);
    console.log(error.stack);
});

client.on('close', () => {
    process.exit(0);
});
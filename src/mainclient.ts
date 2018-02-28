import { Client } from "./quicker/client";
import { HttpHelper } from "./http/http0.9/http.helper";
import { QuicStream } from "./quicker/quic.stream";



let host = process.argv[2] || "127.0.0.1";
let port = process.argv[3] || 4433;

if (isNaN(Number(port))) {
    console.log("port must be a number: node ./mainclient.js 127.0.0.1 4433");
    process.exit(-1);
}

console.log("QUICker client connecting to " + host + ":" + port);

var httpHelper = new HttpHelper();
var client = Client.connect(host, Number(port));
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
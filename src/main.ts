import { Server } from "./quicker/server";
import { readFileSync } from "fs";
import { QuicStream } from "./quicker/quic.stream";
import { HttpHelper } from "./http/http0.9/http.helper";
import { EventConstants } from "./utilities/event.constants";

let host = process.argv[2] || "127.0.0.1";
let port = process.argv[3] || 4433;
let key  = process.argv[4] || "../keys/selfsigned_default.key";
let cert = process.argv[5] || "../keys/selfsigned_default.crt";

if (isNaN(Number(port))) {
    console.log("port must be a number: node ./main.js 127.0.0.1 4433 ca.key ca.cert");
    process.exit(-1);
}

console.log("Running QUICker server at " + host + ":" + port + ", with certs: " + key + ", " + cert);

var httpHelper = new HttpHelper();
var server = Server.createServer({
    key: readFileSync(key),
    cert: readFileSync(cert)
});
server.listen(Number(port), host);

server.on(EventConstants.STREAM, (quicStream: QuicStream) => {
    var bufferedData: Buffer = Buffer.alloc(0);

    quicStream.on(EventConstants.QUIC_STREAM_DATA, (data: Buffer) => {
        bufferedData = Buffer.concat([bufferedData, data]);
    });

    quicStream.on(EventConstants.QUIC_STREAM_END, () => {
        var output = httpHelper.handleRequest(bufferedData);
        quicStream.end(output);
    });
});

server.on(EventConstants.DRAINING, (connectionId: string) => {
    console.log("connection with connectionID " + connectionId + " is draining");
});

server.on(EventConstants.CLOSE, (connectionId: string) => {
    console.log("connection with connectionID " + connectionId + " is closed");
});
import { Server } from "./quicker/server";
import { readFileSync } from "fs";
import { QuicStream } from "./quicker/quic.stream";
import { HttpHelper } from "./http/http0.9/http.helper";
import { QuickerEvent } from "./quicker/quicker.event";
import { PacketLogging } from "./utilities/logging/packet.logging";
import { HandshakeState } from "./crypto/qtls";

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

server.on(QuickerEvent.NEW_STREAM, (quicStream: QuicStream) => {
    var bufferedData: Buffer = Buffer.alloc(0);

    quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
        bufferedData = Buffer.concat([bufferedData, data]);
    });

    quicStream.on(QuickerEvent.STREAM_END, () => {
        var output = httpHelper.handleRequest(bufferedData);
        quicStream.end(output);
    });
});

server.on(QuickerEvent.ERROR, (error: Error) => {
    console.log(error.message);
});

server.on(QuickerEvent.CONNECTION_DRAINING, (connectionSrcId: string) => {
    
    console.log("--------------------------------------------------------------------------------------------------");
    console.log("connection with connectionSrcID " + connectionSrcId + " is draining");
    console.log("First printing packets for InitialDestConnectionID (server doesn't know our real SrcID yet), and then for the real SrcID):"); 
    PacketLogging.getInstance().logPacketStats( server.getConnectionManager().getConnectionByStringID(connectionSrcId).getInitialDestConnectionID().toString() );
    PacketLogging.getInstance().logPacketStats(connectionSrcId); 

	console.log("=> EXPECTED: RX 1 INITIAL (+ possibly 1 0-RTT first), then TX 1-2 HANDSHAKE, 5-7 Protected1RTT, then RX 1 HANDSHAKE, 5-7 Protected1RTT\n");

    console.log("Connection allowed early data: " + server.getConnectionManager().getConnectionByStringID(connectionSrcId).getQuicTLS().isEarlyDataAllowed() + " == true" );
    console.log("Connection was re-used:        " + server.getConnectionManager().getConnectionByStringID(connectionSrcId).getQuicTLS().isSessionReused() + " == 1st false, 2nd true" );
    console.log("Connection handshake state:    " + HandshakeState[server.getConnectionManager().getConnectionByStringID(connectionSrcId).getQuicTLS().getHandshakeState()] + " == COMPLETED" );

});

server.on(QuickerEvent.CONNECTION_CLOSE, (connectionSrcId: string) => {
    console.log("connection with connectionID " + connectionSrcId + " is closed");
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./quicker/server");
const fs_1 = require("fs");
const http_helper_1 = require("./http/http0.9/http.helper");
const quicker_event_1 = require("./quicker/quicker.event");
const packet_logging_1 = require("./utilities/logging/packet.logging");
const qtls_1 = require("./crypto/qtls");
const constants_1 = require("./utilities/constants");
const verbose_logging_1 = require("./utilities/logging/verbose.logging");
let host = process.argv[2] || "127.0.0.1";
let port = process.argv[3] || 4433;
let key = process.argv[4] || "../keys/selfsigned_default.key";
let cert = process.argv[5] || "../keys/selfsigned_default.crt";
if (isNaN(Number(port))) {
    console.log("port must be a number: node ./main.js 127.0.0.1 4433 ca.key ca.cert");
    process.exit(-1);
}
constants_1.Constants.LOG_FILE_NAME = "server.log";
verbose_logging_1.VerboseLogging.info("Running QUICker server at " + host + ":" + port + ", with certs: " + key + ", " + cert);
var httpHelper = new http_helper_1.HttpHelper();
var server = server_1.Server.createServer({
    key: fs_1.readFileSync(key),
    cert: fs_1.readFileSync(cert)
});
server.listen(Number(port), host);
server.on(quicker_event_1.QuickerEvent.NEW_STREAM, (quicStream) => {
    var bufferedData = Buffer.alloc(0);
    quicStream.on(quicker_event_1.QuickerEvent.STREAM_DATA_AVAILABLE, (data) => {
        bufferedData = Buffer.concat([bufferedData, data]);
    });
    quicStream.on(quicker_event_1.QuickerEvent.STREAM_END, () => {
        var output = httpHelper.handleRequest(bufferedData);
        quicStream.end(output);
        quicStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: THIS SHOULDN'T BE NEEDED!
    });
});
server.on(quicker_event_1.QuickerEvent.ERROR, (error) => {
    verbose_logging_1.VerboseLogging.error("main:onError : " + error.message + " -- " + JSON.stringify(error));
    console.log(error.stack);
});
server.on(quicker_event_1.QuickerEvent.CONNECTION_DRAINING, (connectionSrcId) => {
    verbose_logging_1.VerboseLogging.debug("--------------------------------------------------------------------------------------------------");
    verbose_logging_1.VerboseLogging.debug("connection with connectionSrcID " + connectionSrcId + " is draining");
    verbose_logging_1.VerboseLogging.debug("First printing packets for InitialDestConnectionID (server doesn't know our real SrcID yet), and then for the real SrcID):");
    packet_logging_1.PacketLogging.getInstance().logPacketStats(server.getConnectionManager().getConnectionByStringID(connectionSrcId).getInitialDestConnectionID().toString());
    packet_logging_1.PacketLogging.getInstance().logPacketStats(connectionSrcId);
    console.log("=> EXPECTED: RX 1 INITIAL (+ possibly 2 0-RTT first), then TX 1 INITIAL, 1-2 HANDSHAKE, 5-7 Protected1RTT, then RX 1 HANDSHAKE, 5-7 Protected1RTT\n");
    verbose_logging_1.VerboseLogging.debug("Connection allowed early data: " + server.getConnectionManager().getConnectionByStringID(connectionSrcId).getQuicTLS().isEarlyDataAllowed() + " == true");
    verbose_logging_1.VerboseLogging.debug("Connection was re-used:        " + server.getConnectionManager().getConnectionByStringID(connectionSrcId).getQuicTLS().isSessionReused() + " == 1st false, 2nd true");
    verbose_logging_1.VerboseLogging.debug("Connection handshake state:    " + qtls_1.HandshakeState[server.getConnectionManager().getConnectionByStringID(connectionSrcId).getQuicTLS().getHandshakeState()] + " == COMPLETED");
});
server.on(quicker_event_1.QuickerEvent.CONNECTION_CLOSE, (connectionSrcId) => {
    verbose_logging_1.VerboseLogging.info("main:onConnectionClose : srcConnectionID " + connectionSrcId + " is closed");
});

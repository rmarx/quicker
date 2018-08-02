import { Client } from "./quicker/client";
import { HttpHelper } from "./http/http0.9/http.helper";
import { QuicStream } from "./quicker/quic.stream";
import { QuickerEvent } from "./quicker/quicker.event";
import { PacketLogging } from "./utilities/logging/packet.logging";



let host = process.argv[2] || "127.0.0.1";
let port = process.argv[3] || 4433;

if (isNaN(Number(port))) {
    console.log("port must be a number: node ./mainclient.js 127.0.0.1 4433");
    process.exit(-1);
}

console.log("QUICker client connecting to " + host + ":" + port);

var httpHelper = new HttpHelper();
for (var i = 0; i < 1; i++) {
    var client = Client.connect(host, Number(port));
    client.on(QuickerEvent.CLIENT_CONNECTED, () => {

        var quicStream: QuicStream = client.request(httpHelper.createRequest("index.html"));
        var bufferedData = Buffer.alloc(0);

        quicStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            //bufferedData = Buffer.concat([bufferedData, data]);
        });

        quicStream.on(QuickerEvent.STREAM_END, () => {
            //console.log(bufferedData.toString('utf8'));
            client.close();
        });


	
        setTimeout(() => {
            for( let i = 0; i < 10; ++i)
            	console.log("///////////////////////////////////////////////////////////////////////////////");
            var client2 = Client.connect(host, Number(port), {
                session: client.getSession(),
                transportparameters: client.getTransportParameters()
            }, httpHelper.createRequest("index.html"));
            client2.on(QuickerEvent.CLIENT_CONNECTED, () => {
                //
            });
            client2.on(QuickerEvent.CONNECTION_CLOSE, () => {
                console.log("Connection2 allowed early data: " + client.getConnection().getQuicTLS().isEarlyDataAllowed() );
                console.log("Connection2 was re-used:        " +  client.getConnection().getQuicTLS().isSessionReused() );
                console.log("Connection2 handshake state:    " + client.getConnection().getQuicTLS().getHandshakeState() );
            });
        }, 3000);
	
	
    });

    client.on(QuickerEvent.ERROR, (error: Error) => {
        console.log("error");
        console.log(error.message);
        console.log(error.stack);
    });

    client.on(QuickerEvent.CONNECTION_CLOSE, () => {
        
        console.log("Packet stats for both connections:");
        PacketLogging.getInstance().logPacketStats();

        console.log("Connection1 allowed early data: " + client.getConnection().getQuicTLS().isEarlyDataAllowed() );
        console.log("Connection1 was re-used:        " +  client.getConnection().getQuicTLS().isSessionReused() );
        console.log("Connection1 handshake state:    " + client.getConnection().getQuicTLS().getHandshakeState() );

        process.exit(0);
    });
}

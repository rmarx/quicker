import { Client } from "../../../quicker/client";
import { StreamType } from "../../../quicker/stream";
import { Http3Request } from "../common/http3.request";
import { QuicStream } from "../../../quicker/quic.stream";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { EventEmitter } from "events";
import { Http3ClientEvent as Http3ClientEvent } from "./http3.client.events";

export class Http3Client extends EventEmitter {
    private connection: Client;
    private controlStream?: QuicStream;
    
    public constructor(hostname: string, port: number) {
        super();
        this.connection = Client.connect(hostname, port);
        
        this.connection.on(QuickerEvent.CLIENT_CONNECTED, () => {
            // Create control stream
            //this.controlStream = this.connection.createStream(StreamType.ClientUni);
            
            this.emit(Http3ClientEvent.CLIENT_CONNECTED);
        });
    }
    
    public get(path: string) {
        const req: Http3Request = new Http3Request({path});
        const stream: QuicStream = this.connection.request(req.toBuffer(), StreamType.ClientBidi);
        stream.end();
        
        let bufferedData: Buffer = new Buffer(0);
        
        stream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            bufferedData = Buffer.concat([bufferedData, data]);
        });
        stream.on(QuickerEvent.STREAM_END, () => {
            // TODO Temporary for debugging, function should return data instead
            console.log(bufferedData.toString());
            this.emit(Http3ClientEvent.RESPONSE_RECEIVED, path, bufferedData)
        })
    }
    
    public close() {
        this.connection.close();
    }
}
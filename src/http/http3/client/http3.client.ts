import { Client } from "../../../quicker/client";
import { StreamType } from "../../../quicker/stream";
import { Http3Request } from "../common/http3.request";
import { QuicStream } from "../../../quicker/quic.stream";
import { QuickerEvent } from "../../../quicker/quicker.event";

export class Http3Client {
    private connection: Client;
    
    public constructor(hostname: string, port: number) {
        this.connection = Client.connect(hostname, port);
    }
    
    public get(path: string) {
        const req: Http3Request = new Http3Request(path);
        const stream: QuicStream = this.connection.request(req.toBuffer(), StreamType.ClientBidi);
        stream.end();
        
        let bufferedData: Buffer = new Buffer(0);
        
        stream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (data: Buffer) => {
            bufferedData = Buffer.concat([bufferedData, data]);
        });
        stream.on(QuickerEvent.STREAM_END, () => {
            // TODO Temporary for debugging, function should return data instead
            console.log(bufferedData.toString());
        })
    }
}
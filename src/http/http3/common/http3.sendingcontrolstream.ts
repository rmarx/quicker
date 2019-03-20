import { QuicStream } from "../../../quicker/quic.stream";
import { Http3BaseFrame } from "./frames/http3.baseframe";
import { Http3UniStreamType } from "./frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../types/vlie";
import { Bignum } from "../../../types/bignum";
import { Http3GoAwayFrame } from "./frames";
import { EndpointType } from "../../../types/endpoint.type";

export class Http3SendingControlStream {
    private endpointType: EndpointType;
    private quicStream: QuicStream;
    
    public constructor(endpointType: EndpointType, quicStream: QuicStream) {
        this.endpointType = endpointType;
        this.quicStream = quicStream;
        // Write an initial frame with StreamType
        quicStream.write(VLIE.encode(Http3UniStreamType.CONTROL));
    }
    
    public sendFrame(frame: Http3BaseFrame) {
        this.quicStream.write(frame.toBuffer());
    }
    
    // Only servers can explicitly stop a connection 
    // Clients can just stop sending requests to shutdown connection
    public close(lastHandledStream: Bignum) {
        if (this.endpointType === EndpointType.Server) {
            this.quicStream.end(new Http3GoAwayFrame(lastHandledStream).toBuffer());
        }
    }
}
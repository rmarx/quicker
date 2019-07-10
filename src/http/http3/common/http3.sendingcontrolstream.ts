import { QuicStream } from "../../../quicker/quic.stream";
import { Http3BaseFrame } from "./frames/http3.baseframe";
import { Http3UniStreamType } from "./frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../types/vlie";
import { Bignum } from "../../../types/bignum";
import { Http3GoAwayFrame } from "./frames";
import { EndpointType } from "../../../types/endpoint.type";
import { QuickerEvent } from "../../../quicker/quicker.event";
import { QlogWrapper } from "../../../utilities/logging/qlog.wrapper";
import { Http3StreamState } from "./types/http3.streamstate";

export class Http3SendingControlStream {
    private endpointType: EndpointType;
    private quicStream: QuicStream;
    private logger: QlogWrapper;
    
    public constructor(endpointType: EndpointType, quicStream: QuicStream, logger: QlogWrapper) {
        this.endpointType = endpointType;
        this.quicStream = quicStream;
        this.logger = logger;
        
        // Write an initial frame with StreamType
        quicStream.write(VLIE.encode(Http3UniStreamType.CONTROL));
        
        // Close when other end closes
        quicStream.on(QuickerEvent.STREAM_END, () => {
            logger.onHTTPStreamStateChanged(quicStream.getStreamId(), Http3StreamState.CLOSED, "PEER_CLOSED");
            quicStream.end();
        });
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
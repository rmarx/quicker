import { QuicStream } from "../../../quicker/quic.stream";
import { Http3BaseFrame } from "./frames/http3.baseframe";
import { Http3UniStreamType } from "./frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../types/vlie";

export class Http3SendingControlStream {
    private quicStream: QuicStream;
    
    public constructor(quicStream: QuicStream) {
        this.quicStream = quicStream;
        // Write an initial frame with StreamType
        quicStream.write(VLIE.encode(Http3UniStreamType.CONTROL));
    }
    
    public sendFrame(frame: Http3BaseFrame) {
        this.quicStream.end(frame.toBuffer());
    }
}
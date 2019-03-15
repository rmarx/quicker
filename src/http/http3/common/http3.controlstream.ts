import { QuicStream } from "../../../quicker/quic.stream";

export enum Http3EndpointType {
    CLIENT,
    SERVER,
}

class Http3ControlStream {
    private quicControlStream: QuicStream;
    private endpointType: Http3EndpointType;    
    
    public constructor(quicControlStream: QuicStream, endpointType: Http3EndpointType) {
        this.quicControlStream = quicControlStream;
        this.endpointType = endpointType;
    }
}
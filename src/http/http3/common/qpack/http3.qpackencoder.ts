import { QuicStream } from "../../../../quicker/quic.stream";
import { createEncoder, deleteEncoder, encodeHeaders as qpackEncode } from "./http3.lsqpackbindings";
import { Http3Header } from "./types/http3.header";
import { Bignum } from "../../../../types/bignum";
import { QuickerEvent } from "../../../../quicker/quicker.event";
import { Http3UniStreamType } from "../frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../../types/vlie";
import { QlogWrapper } from "../../../../utilities/logging/qlog.wrapper";
import { Http3StreamState } from "../types/http3.streamstate";

export class Http3QPackEncoder {
    private encoderStream: QuicStream;
    private peerDecoderStream?: QuicStream;
    private encoderID: number;
    private logger: QlogWrapper;

    // FIXME Arbitrary numbers in parameters
    public constructor(encoderStream: QuicStream, isServer: boolean, logger: QlogWrapper, dynTableSize: number = 1024, maxTableSize: number = 1024, maxRiskedStreams: number = 16) {
        this.encoderStream = encoderStream;
        this.logger = logger;
        
        this.encoderStream.write(VLIE.encode(Http3UniStreamType.ENCODER));
        
        this.encoderID = createEncoder({
            // TODO get default params from settings file?
            is_server: isServer,
            dyn_table_size: dynTableSize, 
            max_table_size: maxTableSize,
            max_risked_streams: maxRiskedStreams,
        });
    }
    
    // Encoders given headers and returns encoded form
    public encodeHeaders(headers: Http3Header[], requestStreamID: Bignum): Buffer {
        const [encodedHeaders, encodeStreamData] = qpackEncode({
            encoderID: this.encoderID,
            headers,
            streamID: requestStreamID.toNumber(), // FIXME possibly bigger than num limit!
        });
        
        if (encodeStreamData.byteLength > 0) {
            this.encoderStream.write(encodeStreamData);
        }
        
        return encodedHeaders;
    }
    
    /**
     * Sets up the peer-initiated decoder stream which corresponds to this encoder
     * Initialbuffer can be passed if there was extra data buffered after the initial streamtype frame
     */
    public setPeerDecoderStream(peerDecoderStream: QuicStream, initialBuffer?: Buffer) {
        this.peerDecoderStream = peerDecoderStream;
        this.setupDecoderStreamEvents(initialBuffer);
    }
    
    public close() {
        deleteEncoder(this.encoderID);
        
        this.logger.onHTTPStreamStateChanged(this.encoderStream.getStreamId(), Http3StreamState.CLOSED, "QPACK_ENCODE")
        
        this.encoderStream.end();
        if (this.peerDecoderStream !== undefined) {
            this.peerDecoderStream.removeAllListeners();
            this.peerDecoderStream.end();
        }
    }
    
    private setupDecoderStreamEvents(initialBuffer?: Buffer) {
        if (this.peerDecoderStream !== undefined) {
            let bufferedData: Buffer = initialBuffer === undefined ? Buffer.alloc(0) : initialBuffer;
            this.peerDecoderStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (newData: Buffer) => {
                bufferedData = Buffer.concat([bufferedData, newData]);
                // TODO consume data
            });
            this.peerDecoderStream.on(QuickerEvent.STREAM_END, () => {
                // TODO
                this.close();
            });   
        }
    }
}
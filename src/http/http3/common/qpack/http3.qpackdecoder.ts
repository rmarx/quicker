import { QuicStream } from "../../../../quicker/quic.stream";
import { createDecoder,  deleteDecoder, decodeHeaders as qpackDecode, DecoderEncoderStreamDataParam, decoderEncoderStreamData } from "./http3.lsqpackbindings";
import { QuickerEvent } from "../../../../quicker/quicker.event";
import { Bignum } from "../../../../types/bignum";
import { Http3Header } from "./types/http3.header";
import { Http3UniStreamType } from "../frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../../types/vlie";
import { QlogWrapper } from "../../../../utilities/logging/qlog.wrapper";
import { Http3StreamState } from "../types/http3.streamstate";
import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";

export class Http3QPackDecoder {
    private peerEncoderStream?: QuicStream;
    private decoderStream: QuicStream;
    private decoderID: number;
    private logger: QlogWrapper;
    
    // FIXME: Arbitrary values for dyntablesize and maxriskedstreams
    public constructor(decoderStream: QuicStream, logger: QlogWrapper, dynTableSize: number = 1024, maxRiskedStreams: number = 16) {
        this.decoderStream = decoderStream;
        this.logger = logger;
        
        this.decoderStream.write(VLIE.encode(Http3UniStreamType.DECODER));
        
        this.decoderID = createDecoder({
            dyn_table_size: dynTableSize,
            max_risked_streams: maxRiskedStreams,
        });
    }
    
    public decodeHeaders(encodedHeaders: Buffer, requestStreamID: Bignum): Http3Header[] {
        const [headers, decoderStreamData]: [Http3Header[], Buffer] = qpackDecode({
            decoderID: this.decoderID,
            headerBuffer: encodedHeaders,
            streamID: requestStreamID.toNumber(), // FIXME possibly bigger than num limit!
        });
        
        this.sendDecoderData(decoderStreamData);
        
        return headers;
    }
    
    public sendDecoderData(decoderData: Buffer) {
        if (decoderData.byteLength > 0) {
            this.decoderStream.write(decoderData);
        }
    }
    
    /**
     * Sets up the peer-initiated encoder stream which corresponds to this decoder
     * Initialbuffer can be passed if there was extra data buffered after the initial streamtype frame
     */
    public setPeerEncoderStream(peerEncoderStream: QuicStream, initialBuffer?: Buffer) {
        this.peerEncoderStream = peerEncoderStream;
        this.setupEncoderStreamEvents(initialBuffer);
    }
    
    public close() {
        deleteDecoder(this.decoderID);
        
        this.logger.onHTTPStreamStateChanged(this.decoderStream.getStreamId(), Http3StreamState.CLOSED, "QPACK_DECODE")
        
        this.decoderStream.end();
        if (this.peerEncoderStream !== undefined) {
            this.peerEncoderStream.removeAllListeners();
            this.peerEncoderStream.end();   
        }
    }
    
    private setupEncoderStreamEvents(initialBuffer?: Buffer) {
        if (this.peerEncoderStream !== undefined) {
            if (initialBuffer !== undefined && initialBuffer.byteLength > 0) {
                VerboseLogging.info("Passing buffer with initial QPACK encoderstream data to decoder with ID <" + this.decoderID + ">.");
                VerboseLogging.trace("INITIAL");
                decoderEncoderStreamData({
                    decoderID: this.decoderID,
                    encoderData: initialBuffer,
                });
            }
            this.peerEncoderStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (newData: Buffer) => {
                // Consume data
                VerboseLogging.info("Passing buffer with QPACK encoderstream data to decoder with ID <" + this.decoderID + ">.");
                VerboseLogging.trace("DEBUG");
                decoderEncoderStreamData({
                    decoderID: this.decoderID,
                    encoderData: newData,
                });
            });
            this.peerEncoderStream.on(QuickerEvent.STREAM_END, () => {
                // TODO
                this.close();
            });   
        }
    }
}
import { QuicStream } from "../../../../quicker/quic.stream";
import { createDecoder, CreateDecoderParam,  deleteDecoder, decodeHeaders as qpackDecode, DecodeHeadersParam } from "./http3.lsqpackbindings";
import { QuickerEvent } from "../../../../quicker/quicker.event";
import { Bignum } from "../../../../types/bignum";
import { Http3Header } from "./types/http3.header";
import { Http3UniStreamType } from "../frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../../types/vlie";

export class Http3QPackDecoder {
    private encoderStream?: QuicStream;
    private decoderStream: QuicStream;
    private decoderID: number;
    
    // FIXME: Arbitrary values for dyntablesize and maxriskedstreams
    public constructor(decoderStream: QuicStream, dynTableSize: number = 1024, maxRiskedStreams: number = 16) {
        this.decoderStream = decoderStream;
        
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
        
        this.decoderStream.write(decoderStreamData);
        
        return headers;
    }
    
    /**
     * Sets up the peer-initiated encoder stream which corresponds to this decoder
     * Initialbuffer can be passed if there was extra data buffered after the initial streamtype frame
     */
    public setPeerEncoderStream(peerEncoderStream: QuicStream, initialBuffer?: Buffer) {
        this.encoderStream = peerEncoderStream;
        this.setupEncoderStreamEvents(initialBuffer);
    }
    
    public close() {
        deleteDecoder(this.decoderID);
        if (this.encoderStream !== undefined) {
            this.encoderStream.end();   
        }
        this.decoderStream.end();
    }
    
    private setupEncoderStreamEvents(initialBuffer?: Buffer) {
        if (this.encoderStream !== undefined) {
            let bufferedData: Buffer = initialBuffer === undefined ? Buffer.alloc(0) : initialBuffer;
            this.encoderStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (newData: Buffer) => {
                bufferedData = Buffer.concat([bufferedData, newData]);
                // TODO consume data
            });
            this.encoderStream.on(QuickerEvent.STREAM_END, () => {
                // TODO
            });   
        }
    }
}
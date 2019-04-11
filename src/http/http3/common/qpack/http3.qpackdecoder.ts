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
        this.decoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later


        this.decoderID = createDecoder({
            dyn_table_size: dynTableSize,
            max_risked_streams: maxRiskedStreams,
        });
    }

    // Decodes given headers and returns decoded form
    // Dryrun can be enabled if the decoder should not automatically transmit updates to peer encoder
    public decodeHeaders(encodedHeaders: Buffer, requestStreamID: Bignum, dryrun: boolean = false): Http3Header[] {
        const [headers, decoderStreamData]: [Http3Header[], Buffer] = qpackDecode({
            decoderID: this.decoderID,
            headerBuffer: encodedHeaders,
            streamID: requestStreamID.toNumber(), // FIXME possibly bigger than num limit!
        });

        if (dryrun === true) {
            this.sendDecoderData(decoderStreamData);
        }

        return headers;
    }

    public sendDecoderData(decoderData: Buffer) {
        if (decoderData.byteLength > 0) {
            this.logger.onQPACKDecoderInstruction(this.decoderStream.getStreamId(), decoderData, "TX");
            this.decoderStream.write(decoderData);
            this.decoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
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

        this.logger.onHTTPStreamStateChanged(this.decoderStream.getStreamId(), Http3StreamState.CLOSED, "EXPLICIT_CLOSE");

        this.decoderStream.end();
        this.decoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
        if (this.peerEncoderStream !== undefined) {
            this.peerEncoderStream.removeAllListeners();
            this.peerEncoderStream.end();
            this.peerEncoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
        }
    }

    private setupEncoderStreamEvents(initialBuffer?: Buffer) {
        if (this.peerEncoderStream !== undefined) {
            if (initialBuffer !== undefined && initialBuffer.byteLength > 0) {
                VerboseLogging.info("Passing buffer with initial QPACK encoderstream data to decoder with ID <" + this.decoderID + ">.");
                this.logger.onQPACKEncoderInstruction(this.peerEncoderStream.getStreamId(), initialBuffer, "RX");
                decoderEncoderStreamData({
                    decoderID: this.decoderID,
                    encoderData: initialBuffer,
                });
            }
            this.peerEncoderStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (newData: Buffer) => {
                // Consume data
                VerboseLogging.info("Passing buffer with QPACK encoderstream data to decoder with ID <" + this.decoderID + ">.");
                if (this.peerEncoderStream !== undefined) {
                    this.logger.onQPACKEncoderInstruction(this.peerEncoderStream.getStreamId(), newData, "RX");
                }
                decoderEncoderStreamData({
                    decoderID: this.decoderID,
                    encoderData: newData,
                });
            });
            this.peerEncoderStream.on(QuickerEvent.STREAM_END, () => {
                if (this.peerEncoderStream !== undefined) {
                    this.logger.onHTTPStreamStateChanged(this.peerEncoderStream.getStreamId(), Http3StreamState.CLOSED, "PEER_CLOSED");
                }
                this.close();
            });
        }
    }
}
import { QuicStream } from "../../../../quicker/quic.stream";
import { createEncoder, deleteEncoder, encodeHeaders as qpackEncode, encoderDecoderStreamData } from "./http3.lsqpackbindings";
import { Http3Header } from "./types/http3.header";
import { Bignum } from "../../../../types/bignum";
import { QuickerEvent } from "../../../../quicker/quicker.event";
import { Http3UniStreamType } from "../frames/streamtypes/http3.unistreamtypeframe";
import { VLIE } from "../../../../types/vlie";
import { QlogWrapper } from "../../../../utilities/logging/qlog.wrapper";
import { Http3StreamState } from "../types/http3.streamstate";
import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";

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
        this.encoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later

        this.encoderID = createEncoder({
            // TODO get default params from settings file?
            is_server: isServer,
            dyn_table_size: dynTableSize,
            max_table_size: maxTableSize,
            max_risked_streams: maxRiskedStreams,
        });
    }

    // Encoders given headers and returns encoded form
    // Dryrun can be enabled if the encoder should not automatically transmit updates to peer decoder
    public encodeHeaders(headers: Http3Header[], requestStreamID: Bignum, dryrun: boolean = false): Buffer {
        const [encodedHeaders, encoderStreamData] = qpackEncode({
            encoderID: this.encoderID,
            headers,
            streamID: requestStreamID.toNumber(), // FIXME possibly bigger than num limit!
        });

        if (dryrun === false) {
            // FIXME TX as trigger is not really useful
            this.logger.onQPACKEncode(encodedHeaders, headers, "TX");
            this.sendEncoderData(encoderStreamData);
        }

        return encodedHeaders;
    }

    public sendEncoderData(encoderData: Buffer) {
        if (encoderData.byteLength > 0) {
            this.logger.onQPACKEncoderInstruction(this.encoderStream.getStreamId(), encoderData, "TX");
            this.encoderStream.write(encoderData);
            this.encoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
        }
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

        this.logger.onHTTPStreamStateChanged(this.encoderStream.getStreamId(), Http3StreamState.CLOSED, "EXPLICIT_CLOSE");

        this.encoderStream.end();
        this.encoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
        if (this.peerDecoderStream !== undefined) {
            this.peerDecoderStream.removeAllListeners();
            this.peerDecoderStream.end();
            this.peerDecoderStream.getConnection().sendPackets(); // we force trigger sending here because it's not yet done anywhere else. FIXME: This should be moved into stream prioritization scheduler later
        }
    }
    
    public getEncoder(): QuicStream {
        return this.encoderStream;
    }

    private setupDecoderStreamEvents(initialBuffer?: Buffer) {
        if (this.peerDecoderStream !== undefined) {
            if (initialBuffer !== undefined && initialBuffer.byteLength > 0) {
                VerboseLogging.info("Passing buffer with initial QPACK decoderstream data to encoder with ID <" + this.encoderID + ">.");
                this.logger.onQPACKDecoderInstruction(this.peerDecoderStream.getStreamId(), initialBuffer, "RX");
                encoderDecoderStreamData({
                    encoderID: this.encoderID,
                    decoderData: initialBuffer,
                });
            }
            this.peerDecoderStream.on(QuickerEvent.STREAM_DATA_AVAILABLE, (newData: Buffer) => {
                // Consume data
                VerboseLogging.info("Passing buffer with QPACK decoderstream data to encoder with ID <" + this.encoderID + ">.\nData: 0x" + newData.toString("hex"));
                if (this.peerDecoderStream !== undefined) {
                    this.logger.onQPACKDecoderInstruction(this.peerDecoderStream.getStreamId(), newData, "RX");
                }
                encoderDecoderStreamData({
                    encoderID: this.encoderID,
                    decoderData: newData,
                });
            });
            this.peerDecoderStream.on(QuickerEvent.STREAM_END, () => {
                if (this.peerDecoderStream !== undefined) {
                    this.logger.onHTTPStreamStateChanged(this.peerDecoderStream.getStreamId(), Http3StreamState.CLOSED, "PEER_CLOSED");
                }
                this.close();
            });
        }
    }
}


export abstract class BaseFrame {
    private type: FrameType;
    private retransmittable: boolean;

    public constructor(type: FrameType, retransmittable: boolean) {
        this.type = type;
        this.retransmittable = retransmittable;
    }

    abstract toBuffer(): Buffer;
    
    public isRetransmittable(): boolean {
        return this.retransmittable;
    }

    public getType(): FrameType {
        return this.type;
    }

}

export enum FrameType {
    // hardcoded in https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-12.4
    PADDING                 = 0x00,
    PING                    = 0x01,

    ACK                     = 0x02,
    ACK_ECN                 = 0x03,

    RESET_STREAM            = 0x04,
    STOP_SENDING            = 0x05,

    CRYPTO                  = 0x06,
    NEW_TOKEN               = 0x07,

    STREAM                  = 0x08, // streams are between 0x10 and 0x17, check for stream with:  type >= FrameType.STREAM && type <= FrameType.STREAM_MAX
    STREAM_MAX_NR           = 0x0f, // not a real frame type, just used for easier reasoning on stream numbers (see line above)

    MAX_DATA                = 0x10,
    MAX_STREAM_DATA         = 0x11,
    MAX_STREAMS_BIDI        = 0x12,
    MAX_STREAMS_UNI         = 0x13,

    DATA_BLOCKED            = 0x14,
    STREAM_DATA_BLOCKED     = 0x15,
    STREAMS_BLOCKED_BIDI    = 0x16,
    STREAMS_BLOCKED_UNI     = 0x17,

    NEW_CONNECTION_ID       = 0x18,
    RETIRE_CONNECTION_ID    = 0x19,

    PATH_CHALLENGE          = 0x1a,
    PATH_RESPONSE           = 0x1b,

    CONNECTION_CLOSE        = 0x1c,
    APPLICATION_CLOSE       = 0x1d,

    UNKNOWN                 = 0xff
}
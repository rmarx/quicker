

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
    // hardcoded in https://tools.ietf.org/html/draft-ietf-quic-transport#section-5
    PADDING = 0x00,
    RST_STREAM = 0x01,
    CONNECTION_CLOSE = 0x02,
    APPLICATION_CLOSE = 0x03,
    MAX_DATA = 0x04,
    MAX_STREAM_DATA = 0x05,
    MAX_STREAM_ID = 0x06,
    PING = 0x07,
    BLOCKED = 0x08,
    STREAM_BLOCKED = 0x09,
    STREAM_ID_BLOCKED = 0x0a,
    NEW_CONNECTION_ID = 0x0b,
    STOP_SENDING = 0x0c,
    RETIRE_CONNECTION_ID = 0x0d,
    PATH_CHALLENGE = 0x0e,
    PATH_RESPONSE = 0x0f,
    STREAM = 0x10, // streams are between 0x10 and 0x17, check for stream with:  type >= FrameType.STREAM && type <= FrameType.STREAM_MAX
    STREAM_MAX_NR = 0x17, // not a real frame type, just used for easier reasoning on stream numbers (see line above)
    CRYPTO = 0x18,
    NEW_TOKEN = 0x19,
    ACK = 0x1a,
    ACK_ECN = 0x1b 
}

// ROBIN: start hier 
// bezig met ACK rework
// zorg dat ACK-only checks ook kijken naar de ACK_ECN dinges... want die zijn ook gewoon ACKS volgens de spec 
// misschien dat we die intern gewoon kunnen behandelen als allemaal 0x1a en extra flag zetten gewoon? 
// eerst eens kijken wat juist de ECN-specific stuff doet 
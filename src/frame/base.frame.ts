

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
    // hardcoded in https://tools.ietf.org/html/draft-ietf-quic-transport#section-7
    PADDING = 0x00,
    RST_STREAM = 0x01,          // "closes"/terminates an individual stream
    CONNECTION_CLOSE = 0x02,    // Closing at the transport/QUIC level, probably due to error
    APPLICATION_CLOSE = 0x03,   // Closing at the application/HTTP level, probably normal shutdown
    MAX_DATA = 0x04,            // max amount of data that can be sent on the full connection (sum of all streams except stream 0) (cumulative since start)
    MAX_STREAM_DATA = 0x05,     // max amount of data that can be sent on for one individual stream (cumulative since start)
    MAX_STREAM_ID = 0x06,       // 
    PING = 0x07,
    BLOCKED = 0x08,
    STREAM_BLOCKED = 0x09,
    STREAM_ID_BLOCKED = 0x0a,
    NEW_CONNECTION_ID = 0x0b,
    STOP_SENDING = 0x0c,
    ACK = 0x0d,
    PATH_CHALLENGE = 0x0e,
    PATH_RESPONSE = 0x0f,
    STREAM = 0x10 // streams are between 0x10 and 0x17, check for stream with:  type >= FrameType.STREAM
}
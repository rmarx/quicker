

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
    PONG = 0x0d,
    ACK = 0x0e,
    STREAM = 0x10
}
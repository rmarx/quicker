export enum Http3FrameType {
    DATA = 0x0,
    HEADERS = 0x1,
    PRIORITY = 0x2,
    CANCEL_PUSH = 0x3,
    SETTINGS = 0x4,
    PUSH_PROMISE = 0x5,
    GOAWAY = 0x7,
    MAX_PUSH_ID = 0xD,
    DUPLICATE_PUSH = 0xE,
    RESERVED = 0xB, // All formats that match with "0xb + (0x1f * N)"
}

/**
 * Frame structure:
 * Length: Variable-length integer (VLIE)
 * Type: 8 bit
 * Frame payload: length can be determined from length field
 */
export abstract class Http3BaseFrame {
    public abstract toBuffer(): Buffer;

    public abstract getPayloadLength(): number;

    /**
     * Returns the Http3FrameType value as an enum, if valid
     * returns undefined if not a known value
     */
    public abstract getFrameType(): Http3FrameType;
};

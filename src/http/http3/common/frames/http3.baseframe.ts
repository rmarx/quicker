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
    RESERVED = 0x21, // All formats that match with "0x1f * N + 0x21"
}

/**
 * Frame structure:
 * Length: Variable-length integer (VLIE)
 * Type: Variable-length integer (VLIE)
 * Frame payload: length can be determined from length field
 */
export abstract class Http3BaseFrame {
    public abstract toBuffer(): Buffer;

    public abstract getEncodedLength(): number;

    /**
     * Returns the Http3FrameType value as an enum
     */
    public abstract getFrameType(): Http3FrameType;
};

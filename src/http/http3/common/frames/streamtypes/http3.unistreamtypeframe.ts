export enum Http3UniStreamType {
    CONTROL = 0x00,
    PUSH = 0x01,
    ENCODER = 0x02,
    DECODER = 0x03,
    RESERVED = 0x21, // 0x1f * N + 0x21
}

/**
 * Frame structure:
 * Stream Type: Variable-length integer (VLIE)
 * Push ID (for push streams): Variable-length integer (VLIE)
 */
export abstract class Http3UniStreamTypeFrame {
    public abstract toBuffer(): Buffer;
    
    public abstract getUniStreamType(): Http3UniStreamType;
};
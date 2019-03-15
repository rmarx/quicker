export enum Http3UniStreamType {
    CONTROL = 0x00,
    PUSH = 0x01,
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
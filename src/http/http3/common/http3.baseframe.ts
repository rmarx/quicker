import { VLIE, VLIEOffset } from "../../../types/vlie";
import { Bignum } from "../../../types/bignum";
import { Http3DataFrame } from "./frames/";
import { Http3PriorityFrame } from "./frames/http3.priorityframe";
import { Http3HeaderFrame } from "./frames/http3.headerframe";

export enum Http3FrameType {
    DATA = 0x1,
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
    /**
     * Parses a buffer and tries to form an Http3Frame object from it
     * Returns undefined if invalid
     * @param buffer A buffer object containing the frame
     * @param bufferOffset The offset within the buffer where the frame starts at
     */
    public static parse(buffer: Buffer, bufferOffset: number): Http3BaseFrame | undefined {
        // TODO Safety checks before parsing to make sure format is valid
        let lengthVlie: VLIEOffset = VLIE.decode(buffer, bufferOffset);
        let length: Bignum = lengthVlie.value;
        let offset: number = lengthVlie.offset;

        let frameType: number = buffer.readUInt8(offset++);
        let frameTypeEnum: Http3FrameType | undefined = this.toFrameType(frameType);
        if (frameTypeEnum === undefined) {
            return undefined;
        }

        // TODO From offset to offset + length BUT length is bignum
        // Risk downcast to number?
        let payload: Buffer = buffer.slice(offset);

        switch(frameType) {
            case Http3FrameType.DATA:
                return new Http3DataFrame(payload);
            case Http3FrameType.HEADERS:
                return new Http3HeaderFrame(payload);
            case Http3FrameType.PRIORITY:
                return new Http3PriorityFrame(payload);
            default:
                return undefined;
        }
    }

    public abstract toBuffer(): Buffer;

    public abstract getPayloadLength(): Bignum;

    /**
     * Returns the Http3FrameType value as an enum, if valid
     * returns undefined if not a known value
     */
    public abstract getFrameType(): Http3FrameType;

    /**
     * Converts the given frametype to a value of enum Http3FrameType
     * If value doesn't match with any known frametype, it returns undefined
     * @param frameType A frametype as a number
     * @returns A value of type Http3FrameType if valid, undefined otherwise
     */
    private static toFrameType(frameType: number): Http3FrameType | undefined {
        switch(frameType) {
            case Http3FrameType.DATA:
            case Http3FrameType.HEADERS:
            case Http3FrameType.PRIORITY:
            case Http3FrameType.CANCEL_PUSH:
            case Http3FrameType.SETTINGS:
            case Http3FrameType.PUSH_PROMISE:
            case Http3FrameType.GOAWAY:
            case Http3FrameType.MAX_PUSH_ID:
            case Http3FrameType.DUPLICATE_PUSH:
                return frameType as Http3FrameType;
            default:
                if (this.isReservedFrameType(frameType) == true) {
                    return Http3FrameType.RESERVED;
                } else {
                    return undefined;
                }
        }
    }

    private static isReservedFrameType(frameType: number): boolean {
        for (let i = 0; i <= 7; ++i) {
            // Check if frametype is of format "0xb + (0x1f * N)"
            if ((frameType ^ (0xb + (0x1f * i))) === 0) {
                return true;
            }
        }
        return false;
    }
};

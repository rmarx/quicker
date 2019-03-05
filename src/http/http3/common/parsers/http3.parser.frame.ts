import { VLIE, VLIEOffset } from "../../../../types/vlie";
import { Bignum } from "../../../../types/bignum";
import { Http3DataFrame, Http3CancelPushFrame } from "../frames";
import { Http3PriorityFrame } from "../frames/http3.priorityframe";
import { Http3HeaderFrame } from "../frames/http3.headerframe";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";
import { Http3BaseFrame, Http3FrameType } from "../http3.baseframe";

/**
 * Parses a buffer and tries to form an Http3Frame object from it
 * Returns undefined if invalid
 * @param buffer A buffer object containing the frame
 * @param bufferOffset The offset within the buffer where the frame starts at
 */
export function parse(buffer: Buffer, bufferOffset: number): [Http3BaseFrame[], number] {
    let frames: Http3BaseFrame[] = [];

    // TODO Safety checks before parsing to make sure format is valid
    let lengthVlie: VLIEOffset = VLIE.decode(buffer, bufferOffset);
    let length: Bignum = lengthVlie.value;
    let offset: number = lengthVlie.offset;

    let frameType: number = buffer.readUInt8(offset++);
    let frameTypeEnum: Http3FrameType | undefined = toFrameType(frameType);
    if (frameTypeEnum === undefined) {
        throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME);
    }

    // TODO From offset to offset + length BUT length is bignum
    // Risk downcast to number?
    let payload: Buffer = buffer.slice(offset, offset + length.toNumber());
    offset += length.toNumber();

    switch(frameType) {
        case Http3FrameType.DATA:
            frames.push(new Http3DataFrame(payload));
            break;
        case Http3FrameType.HEADERS:
            frames.push(new Http3HeaderFrame(payload));
            break;
        case Http3FrameType.PRIORITY:
            frames.push(new Http3PriorityFrame(payload));
            break;
        case Http3FrameType.CANCEL_PUSH:
            frames.push(new Http3CancelPushFrame(payload));
            break;
        default:
            throw new Http3Error(Http3ErrorCode.HTTP3_UNKNOWN_FRAMETYPE, "Unknown frametype encountered while parsing http3 frames");
    }
    
    return [frames, offset];
}

/**
 * Converts the given frametype to a value of enum Http3FrameType
 * If value doesn't match with any known frametype, it returns undefined
 * @param frameType A frametype as a number
 * @returns A value of type Http3FrameType if valid, undefined otherwise
 */
function toFrameType(frameType: number): Http3FrameType | undefined {
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
            if (isReservedFrameType(frameType) == true) {
                return Http3FrameType.RESERVED;
            } else {
                return undefined;
            }
    }
}

function isReservedFrameType(frameType: number): boolean {
    for (let i = 0; i <= 7; ++i) {
        // Check if frametype is of format "0xb + (0x1f * N)"
        if ((frameType ^ (0xb + (0x1f * i))) === 0) {
            return true;
        }
    }
    return false;
}
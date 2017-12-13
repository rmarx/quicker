import { BaseFrame, FrameType } from "./base.frame";
import { assert } from "console";
import { VLIE } from "./../crypto/vlie";
import { Bignum } from "./../utilities/bignum";

export class FrameParser {

    public parse(msg: Buffer, offset: number): BaseFrame[] {
        var frames: BaseFrame[] = [];

        var frameOffset: FrameOffset | undefined = this.parseFrame(msg, offset);
        while(frameOffset !== undefined) {
            frames.push(frameOffset.frame);
            this.parseFrame(msg, frameOffset.offset);
        }
        

        return frames;
    }

    private parseFrame(buffer: Buffer, offset: number): FrameOffset | undefined {
        if(buffer.byteLength >= offset) {
            return undefined;
        }
        var type = buffer.readUInt8(offset);
        switch(type) {
            case FrameType.PADDING:
                // doesn't need parsing and don't need it
                return undefined;
            case FrameType.RST_STREAM:
                var streamID: Bignum = VLIE.decode(buffer, offset);
                offset += streamID.getByteLength();
                var applicationErrorCode = buffer.readUInt16BE(offset);
                offset += 2;
                var finalOffset = VLIE.decode(buffer, offset);
                offset += finalOffset.getByteLength();
            case FrameType.CONNECTION_CLOSE:
            case FrameType.APPLICATION_CLOSE:
            case FrameType.MAX_DATA:
            case FrameType.MAX_STREAM_DATA:
            case FrameType.MAX_STREAM_ID:
            case FrameType.PING:
            case FrameType.BLOCKED:
            case FrameType.STREAM_BLOCKED:
            case FrameType.STREAM_ID_BLOCKED:
            case FrameType.NEW_CONNECTION_ID:
            case FrameType.STOP_SENDING:
            case FrameType.PONG:
            case FrameType.ACK:
        }
        if (type >= FrameType.STREAM_START && type <= FrameType.STREAM_END) {

        }
        return undefined;
    }

}

export interface FrameOffset {
    frame: BaseFrame,
    offset: number
}
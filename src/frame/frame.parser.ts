import {BaseFrame, FrameType} from './base.frame';
import {Bignum} from '../utilities/bignum';
import {VLIE} from '../crypto/vlie';
import {RstStreamFrame} from './general/rst.stream';
import {ApplicationCloseFrame, ConnectionCloseFrame} from './general/close';
import {MaxDataFrame} from './general/max.data';
import {MaxStreamFrame} from './general/max.stream';
import {MaxStreamIdFrame} from './general/max.stream.id';
import {PingFrame, PongFrame} from './general/ping';
import {BlockedFrame} from './general/blocked';
import {StreamBlockedFrame} from './general/stream.blocked';
import {StreamIdBlockedFrame} from './general/stream.id.blocked';
import {ConnectionID} from '../packet/header/base.header';
import {NewConnectionIdFrame} from './general/new.connection.id';
import {StopSendingFrame} from './general/stop.sending';
import {StreamFrame} from './general/stream';



export class FrameParser {

    public parse(msg: Buffer, offset: number): BaseFrame[] {
        var frames: BaseFrame[] = [];

        var frameOffset: FrameOffset | undefined = this.parseFrame(msg, offset);
        while (frameOffset !== undefined) {
            frames.push(frameOffset.frame);
            frameOffset = this.parseFrame(msg, frameOffset.offset);
        }

        return frames;
    }


    private parseFrame(buffer: Buffer, offset: number): FrameOffset | undefined {
        if (buffer.byteLength >= offset) {
            return undefined;
        }
        var type = buffer.readUInt8(offset);
        switch (type) {
            case FrameType.PADDING:
                // doesn't need parsing and don't need it
                return undefined;
            case FrameType.RST_STREAM:
                return this.parseRstStream(buffer, offset);
            case FrameType.CONNECTION_CLOSE:
                return this.parseClose(FrameType.CONNECTION_CLOSE, buffer, offset);
            case FrameType.APPLICATION_CLOSE:
                return this.parseClose(FrameType.APPLICATION_CLOSE, buffer, offset);
            case FrameType.MAX_DATA:
                return this.parseMaxData(buffer, offset);
            case FrameType.MAX_STREAM_DATA:
                return this.parseMaxStreamData(buffer, offset);
            case FrameType.MAX_STREAM_ID:
                return this.parseMaxStreamId(buffer, offset);
            case FrameType.PING:
                return this.parsePing(buffer, offset);
            case FrameType.BLOCKED:
                return this.parseBlocked(buffer, offset);
            case FrameType.STREAM_BLOCKED:
                return this.parseStreamBlocked(buffer, offset);
            case FrameType.STREAM_ID_BLOCKED:
                return this.parseStreamIdBlocked(buffer, offset);
            case FrameType.NEW_CONNECTION_ID:
                return this.parseNewConnectionId(buffer, offset);
            case FrameType.STOP_SENDING:
                return this.parseStopSending(buffer, offset);
            case FrameType.PONG:
                return this.parsePong(buffer, offset);
            case FrameType.ACK:
                return this.parseAck(buffer, offset)
        }
        if (type >= FrameType.STREAM) {
            return this.parseStream(type, buffer, offset);
        }
        return undefined;
    }

    private parseRstStream(buffer: Buffer, offset: number): FrameOffset {
        var streamID: Bignum = VLIE.decode(buffer, offset);
        offset += streamID.getByteLength();
        var applicationErrorCode = buffer.readUInt16BE(offset);
        offset += 2;
        var finalOffset = VLIE.decode(buffer, offset);
        offset += finalOffset.getByteLength();
        return {
            frame: new RstStreamFrame(streamID, applicationErrorCode, finalOffset),
            offset: offset
        };
    }

    private parseClose(type: FrameTypeClose, buffer: Buffer, offset: number): FrameOffset {
        var errorCode = buffer.readUInt16BE(offset);
        offset += 2;
        var phraseLength = VLIE.decode(buffer, offset);
        offset += phraseLength.getByteLength();
        var phrase = buffer.toString('utf8', offset, phraseLength.toNumber());
        offset += phraseLength.toNumber();
        if (type === FrameType.APPLICATION_CLOSE) {
            return {
                frame: new ApplicationCloseFrame(errorCode, phrase),
                offset: offset
            };
        } else {
            return {
                frame: new ConnectionCloseFrame(errorCode, phrase),
                offset: offset
            };
        }

    }

    private parseMaxData(buffer: Buffer, offset: number): FrameOffset {
        var maxData = VLIE.decode(buffer, offset);
        offset += maxData.getByteLength();
        return {
            frame: new MaxDataFrame(maxData),
            offset: offset
        };
    }

    private parseMaxStreamData(buffer: Buffer, offset: number): FrameOffset {
        var streamId = VLIE.decode(buffer, offset);
        offset += streamId.getByteLength();
        var maxStreamData = VLIE.decode(buffer, offset);
        offset += maxStreamData.getByteLength();
        return {
            frame: new MaxStreamFrame(streamId, maxStreamData),
            offset: offset
        };

    }

    private parseMaxStreamId(buffer: Buffer, offset: number): FrameOffset {
        var maxStreamId = VLIE.decode(buffer, offset);
        offset += maxStreamId.getByteLength();
        return {
            frame: new MaxStreamIdFrame(maxStreamId),
            offset: offset
        };
    }

    private parsePing(buffer: Buffer, offset: number): FrameOffset {
        var length = buffer.readUInt8(offset);
        offset++;
        var pingData = Buffer.alloc(length);
        buffer.copy(pingData, 0, offset, offset + length);
        offset += length;
        return {
            frame: new PingFrame(length, pingData),
            offset: offset
        };
    }

    private parseBlocked(buffer: Buffer, offset: number): FrameOffset {
        var blockedOffset = VLIE.decode(buffer, offset);
        offset += blockedOffset.getByteLength();
        return {
            frame: new BlockedFrame(blockedOffset),
            offset: offset
        };
    }

    private parseStreamBlocked(buffer: Buffer, offset: number): FrameOffset {
        var streamId = VLIE.decode(buffer, offset);
        offset += streamId.getByteLength();
        var blockedOffset = VLIE.decode(buffer, offset);
        offset += blockedOffset.getByteLength();
        return {
            frame: new StreamBlockedFrame(streamId, blockedOffset),
            offset: offset
        };
    }

    private parseStreamIdBlocked(buffer: Buffer, offset: number): FrameOffset {
        var streamId = VLIE.decode(buffer, offset);
        offset += streamId.getByteLength();
        return {
            frame: new StreamIdBlockedFrame(streamId),
            offset: offset
        };
    }

    private parseNewConnectionId(buffer: Buffer, offset: number): FrameOffset {
        var sequence = VLIE.decode(buffer, offset);
        offset += sequence.getByteLength();
        var connectionIdBuffer = Buffer.alloc(8);
        buffer.copy(connectionIdBuffer, 0, offset, offset + 8)
        offset += 8;
        var statelessResetToken = Buffer.alloc(16);
        buffer.copy(statelessResetToken, 0, offset, offset + 16)
        offset += 16;
        var connectionId = new ConnectionID(connectionIdBuffer);
        return {
            frame: new NewConnectionIdFrame(connectionId, statelessResetToken),
            offset: offset
        };
    }

    private parseStopSending(buffer: Buffer, offset: number): FrameOffset {
        var streamId = VLIE.decode(buffer, offset);
        offset += streamId.getByteLength();
        var appErrorCode = buffer.readUInt16BE(offset);
        offset += 2;
        return {
            frame: new StopSendingFrame(streamId, appErrorCode),
            offset: offset
        };
    }

    private parsePong(buffer: Buffer, offset: number): FrameOffset {
        var length = buffer.readUInt8(offset);
        offset++;
        if (length === 0) {
            throw Error("FRAME_ERROR");
        }
        var pingData = Buffer.alloc(length);
        buffer.copy(pingData, 0, offset, offset + length);
        offset += length;
        return {
            frame: new PongFrame(length, pingData),
            offset: offset
        };
    }

    private parseAck(buffer: Buffer, offset: number): FrameOffset {
        // TODO
        throw new Error("not implemented");
    }

    private parseStream(type: FrameType, buffer: Buffer, offset: number): FrameOffset {
        var fin = false, len = false, off = false;
        if (type & 0x01) {
            fin = true;
        }
        if (type & 0x02) {
            len = true;
        }
        if (type & 0x04) {
            off = true;
        }
        var streamId = VLIE.decode(buffer, offset);
        offset += streamId.getByteLength();
        var dataLength = Bignum.fromNumber(buffer.length - offset);
        var dataOffset = Bignum.fromNumber(0);
        if (len) {
            dataLength = VLIE.decode(buffer, offset);
            offset += dataLength.getByteLength();
        }
        if (off) {
            dataOffset = VLIE.decode(buffer, offset);
            offset += dataOffset.getByteLength();
        }
        var data = Buffer.alloc(dataLength.toNumber());
        buffer.copy(data, 0, offset, dataLength.toNumber() + offset);
        offset += dataLength.toNumber();

        var streamFrame = new StreamFrame(data);
        streamFrame.setIsFinal(fin);
        streamFrame.setIsFirst(len);
        streamFrame.setIsLast(off);
        streamFrame.setLength(dataLength);
        streamFrame.setOffset(dataOffset);
        return {
            frame: streamFrame,
            offset: offset
        };
    }
}




export interface FrameOffset {
    frame: BaseFrame,
    offset: number
}

type FrameTypeClose = FrameType.CONNECTION_CLOSE | FrameType.APPLICATION_CLOSE;
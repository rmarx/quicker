import {ConnectionErrorCodes} from './errors/connection.codes';
import {QuicError} from './errors/connection.error';
import { Bignum } from '../types/bignum';
import { Connection } from '../types/connection';
import { Stream } from '../types/stream';
import { BasePacket, PacketType } from '../packet/base.packet';
import { StreamFrame } from '../frame/general/stream';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { BaseFrame, FrameType } from '../frame/base.frame';
import { StreamBlockedFrame } from '../frame/general/stream.blocked';
import { PacketFactory } from '../packet/packet.factory';
import { BlockedFrame } from '../frame/general/blocked';
import { MaxDataFrame } from '../frame/general/max.data';
import { FrameFactory } from '../frame/frame.factory';
import { ShortHeaderPacket } from '../packet/packet/short.header.packet';
import { logMethod } from './decorators/log.decorator';


export class FlowControl {

    private blockedStreamFrames: { [key: string]: StreamFrame[] };
    private bufferedFrames: { [key: string]: {[key: string]: StreamFrame } };

    public constructor() {
        this.blockedStreamFrames = {};
        this.bufferedFrames = {};
    }

    public onPacketSend(connection: Connection, basePacket: BasePacket): BasePacket | undefined {
        if (basePacket.getPacketType() === PacketType.Retry || basePacket.getPacketType() === PacketType.VersionNegotiation) {
            return basePacket;
        }
        var baseEncryptedPacket = <BaseEncryptedPacket>basePacket;
        var addedBlockedFrame = false;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame>frame;
                var stream: Stream = connection.getStream(streamFrame.getStreamID());
                var streamFrameBuffer = streamFrame.toBuffer();
                if (!streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
                    var streamAvailable = this.checkRemoteStreamLimit(stream, streamFrame, streamFrameBuffer);
                    var connectionAvailable = this.checkRemoteConnectionLimit(connection, streamFrame, streamFrameBuffer);

                    if (streamAvailable !== FlowControlState.Ok || connectionAvailable !== FlowControlState.Ok) {
                        if (streamAvailable !== FlowControlState.Ok) {
                            var streamBlockedFrame = FrameFactory.createStreamBlockedFrame(stream);
                            // returns undefined when streamblockedframe is already sent for this stream
                            if (streamBlockedFrame !== undefined) {
                                baseEncryptedPacket.getFrames().push(streamBlockedFrame);
                            }
                        }
                        // addedBlockedFrame check to make sure, only 1 blockedframe is added to the packet
                        if (connectionAvailable !== FlowControlState.Ok && !addedBlockedFrame) {
                            var blockedFrame = FrameFactory.createBlockedFrame(connection);
                            baseEncryptedPacket.getFrames().push(blockedFrame);
                        }
                        this.addBlockedStreamFrame(streamFrame);
                        baseEncryptedPacket.getFrames().splice(baseEncryptedPacket.getFrames().indexOf(streamFrame), 1);
                        return;
                    }
                    // Not added when stream id is 0
                    connection.addRemoteOffset(streamFrame.getLength());
                }
                stream.addRemoteOffset(streamFrame.getLength());
            }
        });
        if (baseEncryptedPacket.getFrames().length > 0)
            return basePacket;
        return undefined;
    }

    public onPacketReceived(connection: Connection, basePacket: BasePacket): void {
        if (basePacket.getPacketType() === PacketType.Retry || basePacket.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var frames: BaseFrame[] = [];
        var baseEncryptedPacket = <BaseEncryptedPacket>basePacket;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame>frame;
                var stream: Stream = connection.getStream(streamFrame.getStreamID());

                if (stream.getLocalOffset().greaterThan(streamFrame.getOffset())) {
                    baseEncryptedPacket.getFrames().splice(baseEncryptedPacket.getFrames().indexOf(streamFrame), 1);
                    return;
                }

                if (stream.getLocalOffset().lessThan(streamFrame.getOffset())) {
                    baseEncryptedPacket.getFrames().splice(baseEncryptedPacket.getFrames().indexOf(streamFrame), 1);
                    this.addBufferedStreamFrame(streamFrame);
                    return;
                }
                frames = this.onStreamFrameReceived(connection, stream, streamFrame, frames);
                // Check if out of order frames arrived
                var possibleNextFrame: StreamFrame | undefined = this.getBufferedStreamFrame(stream.getStreamID(), stream.getLocalOffset());
                // if a latter frame has been received before the current one, 
                while (possibleNextFrame !== undefined) {
                    frames = this.onStreamFrameReceived(connection, stream, streamFrame, frames);
                    possibleNextFrame = this.getBufferedStreamFrame(stream.getStreamID(), stream.getLocalOffset());
                }
            }
        });
        if (frames.length > 0) {
            var shortHeaderPacket = PacketFactory.createShortHeaderPacket(connection, frames);
            connection.sendPacket(shortHeaderPacket);
        }
    }

    private onStreamFrameReceived(connection: Connection, stream: Stream, streamFrame: StreamFrame, frames: BaseFrame[]) {
        var addedMaxData = false;
        if (!streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
            var streamCheck = this.checkLocalStreamLimit(stream, streamFrame);
            var connectionCheck = this.checkLocalConnectionLimit(connection, streamFrame);
            if (streamCheck !== FlowControlState.Ok || connectionCheck !== FlowControlState.Ok) {
                if (streamCheck === FlowControlState.Error || connectionCheck === FlowControlState.Error) {
                    throw new QuicError(ConnectionErrorCodes.FLOW_CONTROL_ERROR);
                }
                if (streamCheck === FlowControlState.FinalOffsetError) {
                    throw new QuicError(ConnectionErrorCodes.FINAL_OFFSET_ERROR);
                }
                if (streamCheck === FlowControlState.MaxStreamData) {
                    var maxStreamDataFrame = FrameFactory.createMaxStreamDataFrame(stream);
                    frames.push(maxStreamDataFrame);
                }
                if (connectionCheck === FlowControlState.MaxData && !addedMaxData) {
                    var maxDataFrame = FrameFactory.createMaxDataFrame(connection);
                    frames.push(maxDataFrame);
                }
            }
        }
        connection.addLocalOffset(streamFrame.getLength());
        stream.addLocalOffset(streamFrame.getLength());
        return frames;
    }

    public checkRemoteStreamLimit(stream: Stream, streamFrame: StreamFrame, streamBuffer: Buffer): FlowControlState {
        if (stream.isRemoteLimitExceeded(streamFrame.getLength())) {
            // sent stream blocked
            return FlowControlState.StreamBlocked;
        }
        return FlowControlState.Ok;
    }

    public checkRemoteConnectionLimit(connection: Connection, streamFrame: StreamFrame, streamBuffer: Buffer): FlowControlState {
        if (connection.isRemoteLimitExceeded(streamFrame.getLength())) {
            // sent blocked
            return FlowControlState.Blocked;
        }
        return FlowControlState.Ok;
    }

    public checkLocalStreamLimit(stream: Stream, streamFrame: StreamFrame): FlowControlState {
        if (stream.getLocalFinalOffset() !== undefined && stream.getLocalFinalOffset().greaterThanOrEqual(streamFrame.getOffset())) {
            // sent final offset error
            return FlowControlState.FinalOffsetError;
        }
        if (stream.isLocalLimitExceeded(streamFrame.getLength())) {
            // sent flow control error
            return FlowControlState.Error;
        }
        if (stream.isLocalLimitAlmostExceeded(streamFrame.getLength())) {
            // sent max stream data frame
            return FlowControlState.MaxStreamData;
        }
        return FlowControlState.Ok;
    }

    public checkLocalConnectionLimit(connection: Connection, streamFrame: StreamFrame): FlowControlState {
        if (connection.isLocalLimitExceeded(streamFrame.getLength())) {
            // sent flow control error
            return FlowControlState.Error;
        }
        if (connection.isLocalLimitAlmostExceeded(streamFrame.getLength())) {
            // sent max stream data frame
            return FlowControlState.MaxData;
        }
        return FlowControlState.Ok;
    }

    public getBlockedStreamFrames(streamID: Bignum): StreamFrame[] {
        var key = streamID.toDecimalString();
        return this.blockedStreamFrames[key];
    }

    public getAllBlockedStreamFrames(): StreamFrame[] {
        var all: StreamFrame[] = [];
        for (var k in this.blockedStreamFrames) {
            all = all.concat(this.blockedStreamFrames[k]);
        }
        return all;
    }

    private addBlockedStreamFrame(streamFrame: StreamFrame): void {
        var key = streamFrame.getStreamID().toDecimalString();
        if (this.blockedStreamFrames[key] === undefined) {
            this.blockedStreamFrames[key] = [];
        }
        this.blockedStreamFrames[key].push(streamFrame);
    }

    private getBufferedStreamFrame(streamID: Bignum, localOffset: Bignum): StreamFrame | undefined {
        var key1: string = streamID.toDecimalString();
        var key2: string = localOffset.toDecimalString();
        if (this.bufferedFrames[key1] !== undefined && this.bufferedFrames[key1][key2] !== undefined) {
            return this.bufferedFrames[key1][key2];
        }
        return undefined;
    }

    private addBufferedStreamFrame(streamFrame: StreamFrame): void {
        var key1: string = streamFrame.getStreamID().toDecimalString();
        var key2: string = streamFrame.getOffset().toDecimalString();
        if (this.bufferedFrames[key1] === undefined) {
            this.bufferedFrames[key1] = {};
        }
        if (this.bufferedFrames[key1][key2] === undefined) {
            this.bufferedFrames[key1][key2] = streamFrame;
        }
    }
}

export enum FlowControlState {
    Ok,
    StreamBlocked,
    Blocked,
    MaxData,
    MaxStreamData,
    Error,
    FinalOffsetError
}
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


export class FlowControl {

    private bufferedStreamFrames: { [key: string]: StreamFrame[] };
    private connection: Connection;

    public constructor(connection: Connection) {
        this.bufferedStreamFrames = {};
        this.connection = connection;
    }

    public onPacketSend(basePacket: BasePacket): BasePacket |  undefined {
        if (basePacket.getPacketType() === PacketType.Retry || basePacket.getPacketType() === PacketType.VersionNegotiation) {
            return basePacket;
        }
        var baseEncryptedPacket = <BaseEncryptedPacket>basePacket;
        var addedBlockedFrame = false;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame>frame;
                var stream: Stream = this.connection.getStream(streamFrame.getStreamID());
                var streamFrameBuffer = streamFrame.toBuffer();
                if (!streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
                    var streamAvailable = this.checkRemoteStreamLimit(stream, streamFrame, streamFrameBuffer);
                    var connectionAvailable = this.checkRemoteConnectionLimit(streamFrame, streamFrameBuffer);

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
                            var blockedFrame = FrameFactory.createBlockedFrame(this.connection);
                            baseEncryptedPacket.getFrames().push(blockedFrame);
                        }
                        this.addBufferedStreamFrame(streamFrame);
                        baseEncryptedPacket.getFrames().splice(baseEncryptedPacket.getFrames().indexOf(streamFrame), 1);
                        return;
                    }
                    // Not added when stream id is 0
                    this.connection.addRemoteOffset(streamFrame.getLength());
                }
                stream.addRemoteOffset(streamFrame.getLength());
            }
        });
        if (baseEncryptedPacket.getFrames().length > 0)
            return basePacket;
        return undefined;
    }

    public onPacketReceived(basePacket: BasePacket): void {
        if (basePacket.getPacketType() === PacketType.Retry && basePacket.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var addedMaxData = false;
        var frames: BaseFrame[] = [];
        var baseEncryptedPacket = <BaseEncryptedPacket>basePacket;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame>frame;
                if (!streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
                    var stream: Stream = this.connection.getStream(streamFrame.getStreamID());
                    var streamCheck = this.checkLocalStreamLimit(stream, streamFrame);
                    var connectionCheck = this.checkLocalConnectionLimit(streamFrame);
                    if (streamCheck !== FlowControlState.Ok || connectionCheck !== FlowControlState.Ok) {
                        if (streamCheck === FlowControlState.Error || connectionCheck === FlowControlState.Error) {
                            throw Error("FLOW_CONTROL_ERROR");
                        }
                        if (streamCheck === FlowControlState.FinalOffsetError) {
                            throw Error("FINAL_OFFSET_ERROR");
                        }
                        if (streamCheck === FlowControlState.MaxStreamData) {
                            var maxStreamDataFrame = FrameFactory.createMaxStreamDataFrame(stream);
                            frames.push(maxStreamDataFrame);
                        }
                        if (connectionCheck === FlowControlState.MaxData && !addedMaxData) {
                            var maxDataFrame = FrameFactory.createMaxDataFrame(this.connection);
                            frames.push(maxDataFrame);
                        }
                    }
                }
            }
        });
        if (frames.length > 0) {
            var shortHeaderPacket = PacketFactory.createShortHeaderPacket(this.connection, frames);
            this.connection.sendPacket(shortHeaderPacket);
        }
    }

    public checkRemoteStreamLimit(stream: Stream, streamFrame: StreamFrame, streamBuffer: Buffer): FlowControlState {
        if (stream.isRemoteLimitExceeded(streamFrame.getLength())) {
            // sent stream blocked
            return FlowControlState.StreamBlocked;
        }
        return FlowControlState.Ok;
    }

    public checkRemoteConnectionLimit(streamFrame: StreamFrame, streamBuffer: Buffer): FlowControlState {
        if (this.connection.isRemoteLimitExceeded(streamFrame.getLength())) {
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

    public checkLocalConnectionLimit(streamFrame: StreamFrame): FlowControlState {
        this.connection.addLocalOffset(streamFrame.getLength());
        if (this.connection.isLocalLimitExceeded(streamFrame.getLength())) {
            // sent flow control error
            return FlowControlState.Error;
        }
        if (this.connection.isLocalLimitAlmostExceeded(streamFrame.getLength())) {
            // sent max stream data frame
            return FlowControlState.MaxData;
        }
        return FlowControlState.Ok;
    }

    public getBufferedStreamFrames(streamId: Bignum): StreamFrame[] {
        var key = streamId.toDecimalString();
        return this.bufferedStreamFrames[key];
    }

    public getAllBufferedStreamFrames(): StreamFrame[] {
        var all: StreamFrame[] = [];
        for (var k in this.bufferedStreamFrames) {
            all = all.concat(this.bufferedStreamFrames[k]);
        }
        return all;
    }

    private addBufferedStreamFrame(streamFrame: StreamFrame): void {
        var key = streamFrame.getStreamID().toDecimalString();
        if (this.bufferedStreamFrames[key] === undefined) {
            this.bufferedStreamFrames[key] = [];
        }
        this.bufferedStreamFrames[key].push(streamFrame);
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
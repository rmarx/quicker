import {Bignum} from '../types/bignum';
import {Connection} from '../types/connection';
import {Stream} from '../types/stream';
import {BasePacket, PacketType} from '../packet/base.packet';
import {StreamFrame} from '../frame/general/stream';
import {BaseEncryptedPacket} from '../packet/base.encrypted.packet';
import {BaseFrame, FrameType} from '../frame/base.frame';
import { StreamBlockedFrame } from '../frame/general/stream.blocked';
import { PacketFactory } from '../packet/packet.factory';
import { BlockedFrame } from '../frame/general/blocked';


export class FlowControl {
    
    private bufferedStreamFrames: {[key: string]: StreamFrame[]};
    private connection: Connection;

    public constructor(connection: Connection) {
        this.bufferedStreamFrames = {};
        this.connection = connection;
    }

    public onPacketSend(basePacket: BasePacket): BasePacket | undefined {
        if (basePacket.getPacketType() === PacketType.Retry || basePacket.getPacketType() === PacketType.VersionNegotiation) {
            return basePacket;
        }
        var baseEncryptedPacket = <BaseEncryptedPacket> basePacket;
        var dataAvailable = true;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame> frame;
                var stream: Stream = this.connection.getStream(streamFrame.getStreamID());
                var streamFrameBuffer = streamFrame.toBuffer();
                if (!streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
                    dataAvailable = this.checkRemoteStreamLimit(stream, streamFrame, streamFrameBuffer);
                    if (!dataAvailable) {
                        var streamBlockedFrame = this.getStreamBlocked(stream);
                        if (streamBlockedFrame !== undefined) {
                            baseEncryptedPacket.getFrames().push(streamBlockedFrame);
                        }
                        this.addBufferedStreamFrame(streamFrame);
                        baseEncryptedPacket.getFrames().splice(baseEncryptedPacket.getFrames().indexOf(streamFrame), 1);
                        return;
                    }
                    dataAvailable = this.checkRemoteConnectionLimit(streamFrame, streamFrameBuffer);
                    if (!dataAvailable) {
                        var blockedFrame = this.getBlocked();
                        baseEncryptedPacket.getFrames().push(blockedFrame);
                        this.addBufferedStreamFrame(streamFrame);
                        baseEncryptedPacket.getFrames().splice(baseEncryptedPacket.getFrames().indexOf(streamFrame), 1);
                    }
                } else {
                    stream.addRemoteOffset(streamFrame.getLength());
                }
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
        var baseEncryptedPacket = <BaseEncryptedPacket> basePacket;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame> frame;
                if (!streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
                    var stream: Stream = this.connection.getStream(streamFrame.getStreamID());
                    this.checkLocalStreamLimit(stream, streamFrame);
                    this.checkLocalConnectionLimit(streamFrame);
                }
            }
        });
    }

    public checkRemoteStreamLimit(stream: Stream, streamFrame: StreamFrame, streamBuffer: Buffer): boolean {
        
        return true;
    }

    public checkRemoteConnectionLimit(streamFrame: StreamFrame, streamBuffer: Buffer): boolean {
        return true;
    }

    public checkLocalStreamLimit(stream: Stream, streamFrame: StreamFrame): boolean {
        stream.addLocalOffset(streamFrame.getLength());
        if (stream.isLocalLimitExceeded()) {
            // sent flow control error
            // start connection closing state
            return false;
        }
        if (stream.isLocalLimitAlmostExceeded()) {
            // sent max stream data frame
            return true;
        }
        return true;
    }

    public checkLocalConnectionLimit(streamFrame: StreamFrame): boolean {
        this.connection.addLocalOffset(streamFrame.getLength());
        if (this.connection.isLocalLimitExceeded()) {
            // sent flow control error
            // start connection closing state
            return false;
        }
        if (this.connection.isLocalLimitAlmostExceeded()) {
            // sent max stream data frame
            return true;
        }
        return true;
    }

    public getBufferedStreamFrames(streamId: Bignum): StreamFrame[] {
        var key = streamId.toDecimalString();
        return this.bufferedStreamFrames[key];
    }

    public getAllBufferedStreamFrames(): StreamFrame[] {
        var all: StreamFrame[] = [];
        for(var k in this.bufferedStreamFrames) {
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

    private getStreamBlocked(stream: Stream): StreamBlockedFrame | undefined {
        if (!stream.getBlockedSent()) {
            stream.setBlockedSent(true);
            return new StreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset());
        }
        return undefined;
    }

    private getBlocked(): BlockedFrame {
        return new BlockedFrame(this.connection.getRemoteOffset());
    }
}
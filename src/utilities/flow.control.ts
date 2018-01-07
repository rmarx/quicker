import {Connection} from '../types/connection';
import {Stream} from '../types/stream';
import {BasePacket, PacketType} from '../packet/base.packet';
import {StreamFrame} from '../frame/general/stream';
import {BaseEncryptedPacket} from '../packet/base.encrypted.packet';
import {BaseFrame, FrameType} from '../frame/base.frame';


export class FlowControl {
    
    private bufferedStreamFrames: StreamFrame[];

    public constructor() {
        this.bufferedStreamFrames = [];
    }

    public onPacketReceived(connection: Connection, basePacket: BasePacket) {
        if (basePacket.getPacketType() === PacketType.Retry && basePacket.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var baseEncryptedPacket = <BaseEncryptedPacket> basePacket;
        baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame> frame;
                var streamFrameBuffer = streamFrame.toBuffer();
                
                var stream: Stream = connection.getStream(streamFrame.getStreamID());
                this.checkStreamLimit(connection, stream, streamFrameBuffer);
            }
        });
    }

    public checkStreamLimit(connection: Connection, stream: Stream, streamBuffer: Buffer) {
        stream.addLocalOffset(streamBuffer.byteLength);
        if (stream.isLocalLimitExceeded()) {
            // sent flow control error
            // start connection closing state
            return;
        }
        if (stream.isLocalLimitAlmostExceeded()) {
            // sent max stream data frame
            return;
        }
    }

    public checkConnectionLimit(connection: Connection, streamBuffer: Buffer) {
        //
    }
}
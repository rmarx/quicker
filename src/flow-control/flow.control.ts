import { ConnectionErrorCodes } from '../utilities/errors/connection.codes';
import { QuicError } from '../utilities/errors/connection.error';
import { Bignum } from '../types/bignum';
import { Connection } from '../quicker/connection';
import { Stream } from '../quicker/stream';
import { BasePacket, PacketType } from '../packet/base.packet';
import { StreamFrame } from '../frame/stream';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { BaseFrame, FrameType } from '../frame/base.frame';
import { StreamBlockedFrame } from '../frame/stream.blocked';
import { PacketFactory } from '../utilities/factories/packet.factory';
import { BlockedFrame } from '../frame/blocked';
import { MaxDataFrame } from '../frame/max.data';
import { FrameFactory } from '../utilities/factories/frame.factory';
import { ShortHeaderPacket } from '../packet/packet/short.header.packet';
import { logMethod } from '../utilities/decorators/log.decorator';
import { TransportParameterType } from '../crypto/transport.parameters';
import { Constants } from '../utilities/constants';
import { HandshakeState } from '../crypto/qtls';
import { EndpointType } from '../types/endpoint.type';
import { Time, TimeFormat } from '../types/time';


export class FlowControl {

    public constructor() {
        //
    }

    public static getPackets(connection: Connection, bufferedFrames: BaseFrame[]): BasePacket[] {
        var packets = new Array<BasePacket>();
        if (connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED) {
            var maxPacketSize = new Bignum(Constants.CLIENT_INITIAL_MIN_SIZE);
        } else {
            var maxPacketSize = new Bignum(connection.getRemoteTransportParameter(TransportParameterType.MAX_PACKET_SIZE) - Constants.LONG_HEADER_SIZE);
        }
        var frames = this.getFrames(connection, maxPacketSize);
        var packetFrames = new Array<BaseFrame>();
        var size = new Bignum(0);
        frames.handshakeFrames.forEach((frame: BaseFrame) => {
            // handshake frames are only more than one with server hello and they need to be in different packets
            packets.push(this.createHandshakePackets(connection, [frame]));
        });

        frames.flowControlFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength
            if (size.add(frameSize).greaterThan(maxPacketSize)) {
                packets.push(this.createNewPacket(connection, packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(frame);
        });

        bufferedFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength
            if (size.add(frameSize).greaterThan(maxPacketSize)) {
                packets.push(this.createNewPacket(connection, packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(frame);
        });

        frames.streamFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength
            if (size.add(frameSize).greaterThan(maxPacketSize)) {
                packets.push(this.createNewPacket(connection, packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(frame);
        });
        if (packetFrames.length > 0) {
            packets.push(this.createNewPacket(connection, packetFrames));
        }

        return packets;
    }

    private static createNewPacket(connection: Connection, frames: BaseFrame[]) {
        if (connection.getEndpointType() === EndpointType.Client && connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED) {
            return PacketFactory.createProtected0RTTPacket(connection, frames);
        } else {
            return PacketFactory.createShortHeaderPacket(connection, frames);
        }
    }

    private static createHandshakePackets(connection: Connection, frames: BaseFrame[]) {
        if (connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED) {
            return PacketFactory.createHandshakePacket(connection, frames);
        } else {
            return PacketFactory.createShortHeaderPacket(connection, frames);
        }
    }



    public static getFrames(connection: Connection, maxPacketSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        if (connection.getRemoteTransportParameters() === undefined) {
            var stream = connection.getStream(new Bignum(0));
            handshakeFrames = handshakeFrames.concat(this.getStreamFrames(connection, stream, new Bignum(stream.getData().byteLength), maxPacketSize).handshakeFrames);
        } else if (connection.isRemoteLimitExceeded()) {
            flowControlFrames.push(FrameFactory.createBlockedFrame(connection));
            connection.getStreams().forEach((stream: Stream) => {
                if (stream.isRemoteLimitExceeded()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream));
                }
            });
        } else {
            connection.getStreams().forEach((stream: Stream) => {
                var flowControlFrameObject: FlowControlFrames = this.getStreamFramesForRemote(connection, stream, maxPacketSize);
                streamFrames = streamFrames.concat(flowControlFrameObject.streamFrames);
                flowControlFrames = flowControlFrames.concat(flowControlFrameObject.flowControlFrames);
                handshakeFrames = handshakeFrames.concat(flowControlFrameObject.handshakeFrames);
            });
        }

        flowControlFrames = flowControlFrames.concat(this.getLocalFlowControlFrames(connection));

        return {
            streamFrames: streamFrames,
            flowControlFrames: flowControlFrames,
            handshakeFrames: handshakeFrames
        };
    }

    private static getStreamFramesForRemote(connection: Connection, stream: Stream, maxPacketSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        if (!stream.getStreamID().equals(0) && stream.isRemoteLimitExceeded()) {
            if (!stream.getBlockedSent()) {
                flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream));
                stream.setBlockedSent(true);
            }
        } else if (!connection.isRemoteLimitExceeded() && stream.getData().length !== 0) {
            var streamDataSize = new Bignum(stream.getData().length);

            if ((stream.isRemoteLimitExceeded(streamDataSize) && !stream.getStreamID().equals(0)) || connection.isRemoteLimitExceeded(streamDataSize)) {
                var conDataLeft = connection.getRemoteMaxData().subtract(connection.getRemoteOffset());
                var streamDataLeft = stream.getRemoteMaxData().subtract(stream.getRemoteOffset());
                streamDataSize = conDataLeft.lessThan(streamDataLeft) ? conDataLeft : streamDataLeft;
                if (conDataLeft.equals(streamDataLeft)) {
                    flowControlFrames.push(FrameFactory.createBlockedFrame(connection));
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream));
                } else if (conDataLeft.lessThan(streamDataLeft)) {
                    flowControlFrames.push(FrameFactory.createBlockedFrame(connection));
                } else if (!stream.getBlockedSent()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream));
                    stream.setBlockedSent(true);
                }
            }
            var createdStreamFrames = this.getStreamFrames(connection, stream, streamDataSize, maxPacketSize);
            streamFrames = createdStreamFrames.streamFrames;
            handshakeFrames = createdStreamFrames.handshakeFrames;
        }
        return {
            streamFrames: streamFrames,
            flowControlFrames: flowControlFrames,
            handshakeFrames: handshakeFrames
        };
    }

    private static getStreamFrames(connection: Connection, stream: Stream, streamDataSize: Bignum, maxPacketSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        var streamData = stream.getData().slice(0, streamDataSize.toNumber());

        while (streamData.byteLength > 0) {
            var isFin = stream.getRemoteFinalOffset() !== undefined ? stream.getRemoteFinalOffset().equals(stream.getRemoteOffset().add(streamData.length)) : false;
            streamDataSize = streamDataSize.greaterThan(maxPacketSize) ? maxPacketSize : streamDataSize;
            var frame = (FrameFactory.createStreamFrame(stream, streamData.slice(0, streamDataSize.toNumber()), isFin, true, stream.getRemoteOffset()));
            if (stream.getStreamID().equals(0)) {
                handshakeFrames.push(frame);
            } else {
                streamFrames.push(frame);
            }
            var originalData = stream.getData();
            stream.setData(stream.getData().slice(streamDataSize.toNumber(), originalData.byteLength));
            stream.addRemoteOffset(streamDataSize);
            connection.addRemoteOffset(streamDataSize);

            streamData = stream.getData();
            streamDataSize = new Bignum(streamData.length);
        }

        return {
            streamFrames: streamFrames,
            flowControlFrames: [],
            handshakeFrames: handshakeFrames
        };
    }

    private static getLocalFlowControlFrames(connection: Connection): BaseFrame[] {
        var frames = new Array<BaseFrame>();
        if (connection.isLocalLimitAlmostExceeded() || connection.getIsRemoteBlocked()) {
            var newMaxData = connection.getLocalMaxData().multiply(2);
            frames.push(FrameFactory.createMaxDataFrame(newMaxData));
            connection.setLocalMaxData(newMaxData);
            connection.setIsRemoteBlocked(false);
        }

        connection.getStreams().forEach((stream: Stream) => {
            if (stream.isLocalLimitAlmostExceeded() || stream.getIsRemoteBlocked()) {
                var newMaxStreamData = stream.getLocalMaxData().multiply(2);
                frames.push(FrameFactory.createMaxStreamDataFrame(stream, newMaxStreamData));
                stream.setLocalMaxData(newMaxStreamData);
                stream.setIsRemoteBlocked(false);
            }
        });
        return frames;
    }
}

export interface FlowControlFrames {
    streamFrames: StreamFrame[],
    flowControlFrames: BaseFrame[],
    handshakeFrames: StreamFrame[]
};
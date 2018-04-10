import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
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
        // TODO: calculate maxpacketsize better
        if (connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED) {
            var maxPacketSize = new Bignum(Constants.CLIENT_INITIAL_MIN_FRAME_SIZE);
        } else {
            var maxPacketSize = new Bignum(connection.getRemoteTransportParameter(TransportParameterType.MAX_PACKET_SIZE));
        }
        var frames = this.getFrames(connection, maxPacketSize);
        var packetFrames = new Array<BaseFrame>();
        var size = new Bignum(0);
        frames.handshakeFrames.forEach((frame: BaseFrame) => {
            // handshake frames are only more than one with server hello and they need to be in different packets
            packets.push(this.createNewPacket(connection, [frame]));
        });

        if (connection.getQuicTLS().getHandshakeState() >= HandshakeState.CLIENT_COMPLETED) {
            frames.flowControlFrames.forEach((frame: BaseFrame) => {
                var frameSize = frame.toBuffer().byteLength
                if (size.add(frameSize).greaterThan(maxPacketSize) && !size.equals(0)) {
                    packets.push(this.createNewPacket(connection, packetFrames));
                    size = new Bignum(0);
                    packetFrames = [];
                }
                size = size.add(frameSize);
                packetFrames.push(frame);
            });
        }

        bufferedFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength;
            if (size.add(frameSize).greaterThan(maxPacketSize) && !size.equals(0)) {
                packets.push(this.createNewPacket(connection, packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(frame);
        });

        frames.streamFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength;
            if (size.add(frameSize).greaterThan(maxPacketSize) && !size.equals(0)) {
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
        var handshakeState = connection.getQuicTLS().getHandshakeState();
        var isServer = connection.getEndpointType() !== EndpointType.Client;
        var isHandshake = false;
        frames.forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM) {
                var streamFrame = <StreamFrame> frame;
                if (streamFrame.getStreamID().equals(0)) {
                    isHandshake = true;
                }
            }
        });

        if (handshakeState !== HandshakeState.COMPLETED && handshakeState !== HandshakeState.CLIENT_COMPLETED ) {
            if (connection.getQuicTLS().isEarlyDataAllowed() && !isHandshake && !isServer) {
                return PacketFactory.createProtected0RTTPacket(connection, frames);
            } else if (connection.getStreamManager().getStream(0).getLocalOffset().equals(0) && !isServer && isHandshake) {
                return PacketFactory.createClientInitialPacket(connection, frames);
            } else if (connection.getQuicTLS().isEarlyDataAllowed() && connection.getQuicTLS().isSessionReused() && !isHandshake) {
                return PacketFactory.createShortHeaderPacket(connection, frames); 
            } else {
                return PacketFactory.createHandshakePacket(connection, frames);
            }
        } else if(handshakeState === HandshakeState.CLIENT_COMPLETED) {
            if (isHandshake) {
                return PacketFactory.createHandshakePacket(connection, frames);
            } else {
                return PacketFactory.createShortHeaderPacket(connection, frames);   
            }
        } else {
            return PacketFactory.createShortHeaderPacket(connection, frames);
        }
    }

    public static getFrames(connection: Connection, maxPacketSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        if (connection.getRemoteTransportParameters() === undefined) {
            var stream = connection.getStreamManager().getStream(new Bignum(0));
            handshakeFrames = handshakeFrames.concat(this.getStreamFrames(connection, stream, new Bignum(stream.getData().byteLength), maxPacketSize).handshakeFrames);
        } else if (connection.isRemoteLimitExceeded()) {
            flowControlFrames.push(FrameFactory.createBlockedFrame(connection.getRemoteOffset()));
            var uniAdded = false;
            var bidiAdded = false;
            connection.getStreamManager().getStreams().forEach((stream: Stream) => {
                if (stream.isRemoteLimitExceeded()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                } 
                if (this.isRemoteStreamIdBlocked(connection, stream)) {
                    if (Stream.isUniStreamId(stream.getStreamID()) && !uniAdded) {
                        var frame = this.addRemoteStreamIdBlocked(connection, stream);
                        flowControlFrames.push(frame);
                        uniAdded = true;
                    } else if (Stream.isUniStreamId(stream.getStreamID()) && !bidiAdded) {
                        var frame = this.addRemoteStreamIdBlocked(connection, stream);
                        flowControlFrames.push(frame);
                        bidiAdded = true;
                    }
                }
            });
        } else {
            connection.getStreamManager().getStreams().forEach((stream: Stream) => {
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

        if (!stream.getStreamID().equals(0) && (stream.isRemoteLimitExceeded() || this.isRemoteStreamIdBlocked(connection, stream))) {
            if (stream.isRemoteLimitExceeded() && !stream.getBlockedSent()) {
                flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                stream.setBlockedSent(true);
            }
        } else if (!connection.isRemoteLimitExceeded() && stream.getData().length !== 0) {
            var streamDataSize = new Bignum(stream.getData().length);

            var createdStreamFrames = this.getStreamFrames(connection, stream, streamDataSize, maxPacketSize);
            streamFrames = createdStreamFrames.streamFrames;
            handshakeFrames = createdStreamFrames.handshakeFrames;

            if ((stream.isRemoteLimitExceeded(streamDataSize) && !stream.getStreamID().equals(0)) || 
                    connection.isRemoteLimitExceeded(streamDataSize)) {
                        
                var conDataLeft = connection.getRemoteMaxData().subtract(connection.getRemoteOffset());
                var streamDataLeft = stream.getRemoteMaxData().subtract(stream.getRemoteOffset());
                streamDataSize = conDataLeft.lessThan(streamDataLeft) ? conDataLeft : streamDataLeft;
                if (conDataLeft.equals(streamDataLeft)) {
                    flowControlFrames.push(FrameFactory.createBlockedFrame(connection.getRemoteOffset()));
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                } else if (conDataLeft.lessThan(streamDataLeft)) {
                    flowControlFrames.push(FrameFactory.createBlockedFrame(connection.getRemoteOffset()));
                } else if (!stream.getBlockedSent()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                    stream.setBlockedSent(true);
                }
            } else if (stream.isRemoteLimitExceeded(streamDataSize) && stream.getStreamID().equals(0) && connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
                var streamDataSize = stream.getRemoteMaxData().subtract(stream.getRemoteOffset());
                if (!stream.getBlockedSent()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                    stream.setBlockedSent(true);
                }
            }
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

        /**
         * If stream is receive only, reset stream data
         */
        if (stream.isReceiveOnly()) {
            stream.setData(Buffer.alloc(0));
        }

        var streamData = stream.getData().slice(0, streamDataSize.toNumber());
        var isHandshake = (connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED && stream.getStreamID().equals(0));

        while (streamData.byteLength > 0 && (isHandshake || (!stream.isRemoteLimitExceeded() && !connection.isRemoteLimitExceeded()))) {
            streamDataSize = streamDataSize.greaterThan(maxPacketSize) ? maxPacketSize : streamDataSize;

            if(!isHandshake) {
                streamDataSize = streamDataSize.greaterThan(connection.getRemoteMaxData().subtract(connection.getRemoteOffset())) ? connection.getRemoteMaxData().subtract(connection.getRemoteOffset()) : streamDataSize;
                streamDataSize = streamDataSize.greaterThan(stream.getRemoteMaxData().subtract(stream.getRemoteOffset())) ? stream.getRemoteMaxData().subtract(stream.getRemoteOffset()) : streamDataSize;
            }

            var isFin = stream.getRemoteFinalOffset() !== undefined ? stream.getRemoteFinalOffset().equals(stream.getRemoteOffset().add(streamDataSize)) : false;
            var frame = (FrameFactory.createStreamFrame(stream.getStreamID(), streamData.slice(0, streamDataSize.toNumber()), isFin, true, stream.getRemoteOffset()));
            if (stream.getStreamID().equals(0)) {
                handshakeFrames.push(frame);
            } else {
                streamFrames.push(frame);
            }
            var originalData = stream.getData();
            stream.setData(stream.getData().slice(streamDataSize.toNumber(), originalData.byteLength));
            stream.addRemoteOffset(streamDataSize);
            if (!stream.getStreamID().equals(0)) {
                connection.addRemoteOffset(streamDataSize);
            }

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
        if (connection.getQuicTLS().getHandshakeState() === HandshakeState.SERVER_HELLO) {
            return [];
        }
        var frames = new Array<BaseFrame>();
        if (connection.isLocalLimitAlmostExceeded() || connection.getIsRemoteBlocked()) {
            var newMaxData = connection.getLocalMaxData().multiply(2);
            frames.push(FrameFactory.createMaxDataFrame(newMaxData));
            connection.setLocalMaxData(newMaxData);
            connection.setIsRemoteBlocked(false);
        }

        connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            if (!stream.getStreamID().equals(0) && stream.isLocalLimitAlmostExceeded() || stream.getIsRemoteBlocked()) {
                var newMaxStreamData = stream.getLocalMaxData().multiply(2);
                frames.push(FrameFactory.createMaxStreamDataFrame(stream.getStreamID(), newMaxStreamData));
                stream.setLocalMaxData(newMaxStreamData);
                stream.setIsRemoteBlocked(false);
            }
        });

        frames = frames.concat(this.checkLocalStreamId(connection));
        return frames;
    }


    private static checkLocalStreamId(connection: Connection): BaseFrame[] {
        var frames = new Array<BaseFrame>();
        var uniAdded = false;
        var bidiAdded = false;
        connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            var streamId = stream.getStreamID();
            if (stream.getStreamID().equals(0) || this.isRemoteStreamId(connection, streamId)) {
                return;
            }
            var newStreamId = undefined;
            if (Stream.isUniStreamId(streamId)) {
                if (streamId.add(Constants.MAX_STREAM_ID_BUFFER_SPACE).greaterThanOrEqual(connection.getLocalMaxStreamUni().multiply(4))) {
                    newStreamId = connection.getLocalMaxStreamUni().add(Constants.MAX_STREAM_ID_INCREMENT);
                    connection.setLocalMaxStreamUni(newStreamId);
                }
            } else {
                if (streamId.add(Constants.MAX_STREAM_ID_BUFFER_SPACE).greaterThanOrEqual(connection.getLocalMaxStreamBidi().multiply(4))) {
                    newStreamId = connection.getLocalMaxStreamBidi().add(Constants.MAX_STREAM_ID_INCREMENT);
                    connection.setLocalMaxStreamBidi(newStreamId);
                }
            }
            if (newStreamId !== undefined) {
                frames.push(FrameFactory.createMaxStreamIdFrame(newStreamId));
            }
        });

        return frames;
    }

    private static isRemoteStreamId(connection: Connection, streamId: Bignum): boolean {
        if (connection.getEndpointType() === EndpointType.Server) {
            return streamId.and(new Bignum(0x1)).equals(1);
        }
        return streamId.and(new Bignum(0x1)).equals(0);
    }


    private static isRemoteStreamIdBlocked(connection: Connection, stream: Stream): boolean {
        if (!this.isRemoteStreamId(connection, stream.getStreamID())) {
            return false;
        }
        var streamId = stream.getStreamID();
        if (Stream.isUniStreamId(streamId)) {
            return streamId.greaterThanOrEqual(connection.getRemoteMaxStreamUni().multiply(4));
        } else {
            return streamId.greaterThanOrEqual(connection.getRemoteMaxStreamBidi().multiply(4));
        }
    }

    private static addRemoteStreamIdBlocked(connection: Connection, stream: Stream): BaseFrame {
        var frames = new Array<BaseFrame>();
        var streamId = stream.getStreamID();
        var newStreamId = undefined;
        if (Stream.isUniStreamId(streamId)) {
            return FrameFactory.createStreamIdBlockedFrame(connection.getRemoteMaxStreamUni());
        } else {
            return FrameFactory.createStreamIdBlockedFrame(connection.getRemoteMaxStreamBidi());
        }
    }
}

export interface FlowControlFrames {
    streamFrames: StreamFrame[],
    flowControlFrames: BaseFrame[],
    handshakeFrames: StreamFrame[]
};
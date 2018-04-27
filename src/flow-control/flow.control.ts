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
import { ShortHeaderType, ShortHeader } from '../packet/header/short.header';


export class FlowControl {

    private shortHeaderSize!: number;
    private connection: Connection;
    private bufferedFrames: BaseFrame[];

    public constructor(connection: Connection) {
        this.connection = connection;
        this.bufferedFrames = [];
    }

    public queueFrame(baseFrame: BaseFrame): void {
        this.bufferedFrames.push(baseFrame);
    }

    public isAckBuffered(): boolean {
        var containsAck = false;
        this.bufferedFrames.forEach((baseFrame: BaseFrame) => {
            if (baseFrame.getType() === FrameType.ACK) {
                containsAck = true;
            }
        });
        return containsAck;
    }   

    public getPackets(): BasePacket[] {
        var packets = new Array<BasePacket>();
        // TODO: calculate maxpacketsize better
        if (this.connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED) {
            var maxPayloadSize = new Bignum(Constants.CLIENT_INITIAL_MIN_SIZE);
        } else {
            if (this.shortHeaderSize === undefined) {
                this.shortHeaderSize = new ShortHeader(ShortHeaderType.FourOctet, this.connection.getDestConnectionID(), undefined, false, this.connection.getSpinBit()).getSize();
            }
            var maxPayloadSize = new Bignum(this.connection.getRemoteTransportParameter(TransportParameterType.MAX_PACKET_SIZE) - this.shortHeaderSize);
        }
        var frames = this.getFrames(maxPayloadSize);
        var packetFrames = new Array<BaseFrame>();
        var size = new Bignum(0);
        frames.handshakeFrames.forEach((frame: BaseFrame) => {
            // handshake frames are only more than one with server hello and they need to be in different packets
            packets.push(this.createNewPacket([frame]));
        });

        if (this.connection.getQuicTLS().getHandshakeState() >= HandshakeState.CLIENT_COMPLETED) {
            frames.flowControlFrames.forEach((frame: BaseFrame) => {
                var frameSize = frame.toBuffer().byteLength
                if (size.add(frameSize).greaterThan(maxPayloadSize) && !size.equals(0)) {
                    packets.push(this.createNewPacket(packetFrames));
                    size = new Bignum(0);
                    packetFrames = [];
                }
                size = size.add(frameSize);
                packetFrames.push(frame);
            });
        }

        var bufferedFrame: BaseFrame | undefined = this.bufferedFrames.shift();
        while (bufferedFrame !== undefined) {
            var frameSize = bufferedFrame.toBuffer().byteLength;
            if (size.add(frameSize).greaterThan(maxPayloadSize) && !size.equals(0)) {
                packets.push(this.createNewPacket(packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(bufferedFrame);
            bufferedFrame = this.bufferedFrames.shift();
        }

        frames.streamFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength;
            if (size.add(frameSize).greaterThan(maxPayloadSize) && !size.equals(0)) {
                packets.push(this.createNewPacket(packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(frame);
        });
        if (packetFrames.length > 0) {
            packets.push(this.createNewPacket(packetFrames));
        }

        return packets;
    }

    private createNewPacket(frames: BaseFrame[]) {
        var handshakeState = this.connection.getQuicTLS().getHandshakeState();
        var isServer = this.connection.getEndpointType() !== EndpointType.Client;
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
            if (this.connection.getQuicTLS().isEarlyDataAllowed() && !isHandshake && !isServer) {
                return PacketFactory.createProtected0RTTPacket(this.connection, frames);
            } else if (this.connection.getStreamManager().getStream(0).getLocalOffset().equals(0) && !isServer && isHandshake) {
                return PacketFactory.createClientInitialPacket(this.connection, frames);
            } else if (this.connection.getQuicTLS().isEarlyDataAllowed() && this.connection.getQuicTLS().isSessionReused() && !isHandshake) {
                return PacketFactory.createShortHeaderPacket(this.connection, frames); 
            } else {
                return PacketFactory.createHandshakePacket(this.connection, frames);
            }
        } else if(handshakeState === HandshakeState.CLIENT_COMPLETED) {
            if (isHandshake) {
                return PacketFactory.createHandshakePacket(this.connection, frames);
            } else {
                return PacketFactory.createShortHeaderPacket(this.connection, frames);   
            }
        } else {
            return PacketFactory.createShortHeaderPacket(this.connection, frames);
        }
    }

    public getFrames(maxPayloadSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        if (this.connection.getRemoteTransportParameters() === undefined) {
            var stream = this.connection.getStreamManager().getStream(new Bignum(0));
            handshakeFrames = handshakeFrames.concat(this.getStreamFrames(stream, maxPayloadSize).handshakeFrames);
        } else if (this.connection.isRemoteLimitExceeded()) {
            flowControlFrames.push(FrameFactory.createBlockedFrame(this.connection.getRemoteOffset()));
            var uniAdded = false;
            var bidiAdded = false;
            this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
                if (stream.isRemoteLimitExceeded()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                } 
                if (this.isRemoteStreamIdBlocked(stream)) {
                    if (Stream.isUniStreamId(stream.getStreamID()) && !uniAdded) {
                        var frame = this.addRemoteStreamIdBlocked(stream);
                        flowControlFrames.push(frame);
                        uniAdded = true;
                    } else if (Stream.isUniStreamId(stream.getStreamID()) && !bidiAdded) {
                        var frame = this.addRemoteStreamIdBlocked(stream);
                        flowControlFrames.push(frame);
                        bidiAdded = true;
                    }
                }
            });
        } else {
            this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
                var flowControlFrameObject: FlowControlFrames = this.getStreamFramesForRemote(stream, maxPayloadSize);
                streamFrames = streamFrames.concat(flowControlFrameObject.streamFrames);
                flowControlFrames = flowControlFrames.concat(flowControlFrameObject.flowControlFrames);
                handshakeFrames = handshakeFrames.concat(flowControlFrameObject.handshakeFrames);
            });
        }

        flowControlFrames = flowControlFrames.concat(this.getLocalFlowControlFrames());

        return {
            streamFrames: streamFrames,
            flowControlFrames: flowControlFrames,
            handshakeFrames: handshakeFrames
        };
    }

    private getStreamFramesForRemote(stream: Stream, maxPayloadSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        if (!stream.getStreamID().equals(0) && (stream.isRemoteLimitExceeded() || this.isRemoteStreamIdBlocked(stream))) {
            if (stream.isRemoteLimitExceeded() && !stream.getBlockedSent()) {
                flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                stream.setBlockedSent(true);
            }
        } else if (!this.connection.isRemoteLimitExceeded() && stream.getData().length !== 0) {
            var createdStreamFrames = this.getStreamFrames(stream, maxPayloadSize);
            streamFrames = createdStreamFrames.streamFrames;
            handshakeFrames = createdStreamFrames.handshakeFrames;

            if ((stream.isRemoteLimitExceeded() && !stream.getStreamID().equals(0)) || 
                    this.connection.isRemoteLimitExceeded()) {
                        
                var conDataLeft = this.connection.getRemoteMaxData().subtract(this.connection.getRemoteOffset());
                var streamDataLeft = stream.getRemoteMaxData().subtract(stream.getRemoteOffset());
                streamDataSize = conDataLeft.lessThan(streamDataLeft) ? conDataLeft : streamDataLeft;
                if (conDataLeft.equals(streamDataLeft)) {
                    flowControlFrames.push(FrameFactory.createBlockedFrame(this.connection.getRemoteOffset()));
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                } else if (conDataLeft.lessThan(streamDataLeft)) {
                    flowControlFrames.push(FrameFactory.createBlockedFrame(this.connection.getRemoteOffset()));
                } else if (!stream.getBlockedSent()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                    stream.setBlockedSent(true);
                }
            } else if (stream.isRemoteLimitExceeded() && stream.getStreamID().equals(0) && this.connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
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

    private getStreamFrames(stream: Stream, maxPayloadSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var handshakeFrames = new Array<StreamFrame>();

        /**
         * If stream is receive only, reset stream data
         */
        if (stream.isReceiveOnly()) {
            stream.resetData();
        }
        var isHandshake = (this.connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED && stream.getStreamID().equals(0));

        while (stream.getOutgoingDataSize() > 0 && (isHandshake || (!stream.isRemoteLimitExceeded() && !this.connection.isRemoteLimitExceeded()))) {
            var streamDataSize = maxPayloadSize.lessThan(stream.getOutgoingDataSize()) ? maxPayloadSize : new Bignum(stream.getOutgoingDataSize());

            if(!isHandshake) {
                streamDataSize = streamDataSize.greaterThan(this.connection.getRemoteMaxData().subtract(this.connection.getRemoteOffset())) ? this.connection.getRemoteMaxData().subtract(this.connection.getRemoteOffset()) : streamDataSize;
                streamDataSize = streamDataSize.greaterThan(stream.getRemoteMaxData().subtract(stream.getRemoteOffset())) ? stream.getRemoteMaxData().subtract(stream.getRemoteOffset()) : streamDataSize;
            }

            var streamData = stream.popData(streamDataSize.toNumber());
            var isFin = stream.getRemoteFinalOffset() !== undefined ? stream.getRemoteFinalOffset().equals(stream.getRemoteOffset().add(streamDataSize)) : false;
            var frame = (FrameFactory.createStreamFrame(stream.getStreamID(), streamData.slice(0, streamDataSize.toNumber()), isFin, true, stream.getRemoteOffset()));
            if (stream.getStreamID().equals(0)) {
                handshakeFrames.push(frame);
            } else {
                streamFrames.push(frame);
            }
            stream.addRemoteOffset(streamDataSize);
            if (!stream.getStreamID().equals(0)) {
                this.connection.addRemoteOffset(streamDataSize);
            }
        }

        return {
            streamFrames: streamFrames,
            flowControlFrames: [],
            handshakeFrames: handshakeFrames
        };
    }

    private getLocalFlowControlFrames(): BaseFrame[] {
        if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.SERVER_HELLO) {
            return [];
        }
        var frames = new Array<BaseFrame>();
        if (this.connection.isLocalLimitAlmostExceeded() || this.connection.getIsRemoteBlocked()) {
            var newMaxData = this.connection.getLocalMaxData().multiply(2);
            frames.push(FrameFactory.createMaxDataFrame(newMaxData));
            this.connection.setLocalMaxData(newMaxData);
            this.connection.setIsRemoteBlocked(false);
        }

        this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            if (!stream.getStreamID().equals(0) && stream.isLocalLimitAlmostExceeded() || stream.getIsRemoteBlocked()) {
                var newMaxStreamData = stream.getLocalMaxData().multiply(2);
                frames.push(FrameFactory.createMaxStreamDataFrame(stream.getStreamID(), newMaxStreamData));
                stream.setLocalMaxData(newMaxStreamData);
                stream.setIsRemoteBlocked(false);
            }
        });

        frames = frames.concat(this.checkLocalStreamId());
        return frames;
    }


    private checkLocalStreamId(): BaseFrame[] {
        var frames = new Array<BaseFrame>();
        var uniAdded = false;
        var bidiAdded = false;
        this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            var streamId = stream.getStreamID();
            if (stream.getStreamID().equals(0) || this.isRemoteStreamId(streamId)) {
                return;
            }
            var newStreamId = undefined;
            if (Stream.isUniStreamId(streamId)) {
                if (streamId.add(Constants.MAX_STREAM_ID_BUFFER_SPACE).greaterThanOrEqual(this.connection.getLocalMaxStreamUni().multiply(4))) {
                    newStreamId = this.connection.getLocalMaxStreamUni().add(Constants.MAX_STREAM_ID_INCREMENT);
                    this.connection.setLocalMaxStreamUni(newStreamId);
                }
            } else {
                if (streamId.add(Constants.MAX_STREAM_ID_BUFFER_SPACE).greaterThanOrEqual(this.connection.getLocalMaxStreamBidi().multiply(4))) {
                    newStreamId = this.connection.getLocalMaxStreamBidi().add(Constants.MAX_STREAM_ID_INCREMENT);
                    this.connection.setLocalMaxStreamBidi(newStreamId);
                }
            }
            if (newStreamId !== undefined) {
                frames.push(FrameFactory.createMaxStreamIdFrame(newStreamId));
            }
        });

        return frames;
    }

    private isRemoteStreamId(streamId: Bignum): boolean {
        if (this.connection.getEndpointType() === EndpointType.Server) {
            return streamId.and(new Bignum(0x1)).equals(1);
        }
        return streamId.and(new Bignum(0x1)).equals(0);
    }


    private isRemoteStreamIdBlocked(stream: Stream): boolean {
        if (!this.isRemoteStreamId(stream.getStreamID())) {
            return false;
        }
        var streamId = stream.getStreamID();
        if (Stream.isUniStreamId(streamId)) {
            return streamId.greaterThanOrEqual(this.connection.getRemoteMaxStreamUni().multiply(4));
        } else {
            return streamId.greaterThanOrEqual(this.connection.getRemoteMaxStreamBidi().multiply(4));
        }
    }

    private addRemoteStreamIdBlocked(stream: Stream): BaseFrame {
        var frames = new Array<BaseFrame>();
        var streamId = stream.getStreamID();
        var newStreamId = undefined;
        if (Stream.isUniStreamId(streamId)) {
            return FrameFactory.createStreamIdBlockedFrame(this.connection.getRemoteMaxStreamUni());
        } else {
            return FrameFactory.createStreamIdBlockedFrame(this.connection.getRemoteMaxStreamBidi());
        }
    }
}

export interface FlowControlFrames {
    streamFrames: StreamFrame[],
    flowControlFrames: BaseFrame[],
    handshakeFrames: StreamFrame[]
};
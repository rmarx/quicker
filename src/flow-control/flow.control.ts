import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { QuicError } from '../utilities/errors/connection.error';
import { Bignum } from '../types/bignum';
import { Connection, ConnectionState } from '../quicker/connection';
import { Stream } from '../quicker/stream';
import { BasePacket, PacketType } from '../packet/base.packet';
import { StreamFrame } from '../frame/stream';
import { CryptoFrame } from '../frame/crypto';
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
import { AckHandler } from '../utilities/handlers/ack.handler';
import { PacketNumber } from '../packet/header/header.properties';


export class FlowControl {

    /**
     * MAJOR REFACTOR TODO: handshake state handling
     * This is incredibly widespread here, using multiple different methods (checking if it is stream 0, checking handshakestate from QTLS), isHandshake bool, ...
     * The real question is: why is this in flow control in the first place?
     * Spec says: https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.1
     * the complete cryptographic handshake message MUST
        fit in a single packet [...]
     * The payload of a UDP datagram carrying the Initial packet MUST be
         expanded to at least 1200 octets (see Section 8), by adding PADDING
        frames to the Initial packet and/or by combining the Initial packet
        with a 0-RTT packet (see Section 4.6).
     * Given this setup, we can take a much easier, directer route for the handshake and do it outside of the general flow control logic, simplifying things greatly
     * This will probably not change in the future either, since the initial data should always fit in a single UDP datagram
     * TODO: check if this is easy to do outside of flow control with early data though... 
     */

    private shortHeaderSize!: number;
    private connection: Connection;
    private ackHandler: AckHandler;
    private bufferedFrames: BaseFrame[];

    public constructor(connection: Connection, ackHandler: AckHandler) {
        this.connection = connection;
        this.ackHandler = ackHandler;
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
            var maxPayloadSize = new Bignum(Constants.INITIAL_MIN_SIZE);
        } else {
            if (this.shortHeaderSize === undefined) {
                this.shortHeaderSize = new ShortHeader(ShortHeaderType.FourOctet, this.connection.getDestConnectionID(), new PacketNumber(-1), false, this.connection.getSpinBit()).getSize();
            }
            var maxPayloadSize = new Bignum(this.connection.getRemoteTransportParameter(TransportParameterType.MAX_PACKET_SIZE) - this.shortHeaderSize);
        }
        var frames = this.getFrames(maxPayloadSize);
        var packetFrames = new Array<BaseFrame>();
        var size = new Bignum(0);


        var ackBuffered: boolean = this.isAckBuffered();
        if (!ackBuffered && (this.connection.getState() === ConnectionState.Handshake || this.connection.getState() === ConnectionState.Open)) {
            var ackFrame = this.ackHandler.getAckFrame(this.connection);
            if (ackFrame !== undefined) {
                packets.push(this.createNewPacket([ackFrame]));
            }
        }

        frames.handshakeFrames.forEach((frame: BaseFrame) => {
            // handshake frames are only more than one with server hello and they need to be in different packets
            // TODO: draft-13 : this is no longer correct, same encryption level can be in same packet
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

    private serverHasSentInitial:boolean = false;

    private createNewPacket(frames: BaseFrame[]) {
        var handshakeState = this.connection.getQuicTLS().getHandshakeState();
        var isServer = this.connection.getEndpointType() !== EndpointType.Client;
        var isHandshake = false;
        frames.forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM && frame.getType() <= FrameType.STREAM_MAX_NR) {
                var streamFrame = <StreamFrame> frame;
                if (streamFrame.getStreamID().equals(0)) {
                    isHandshake = true;
                }
            }
            if( frame.getType() == FrameType.CRYPTO ) // TODO: update logic: CRYPTO can be sent after handshake as well, obviously
                isHandshake = true;
        });
        if (handshakeState !== HandshakeState.COMPLETED) { 
            // REFACTOR TODO: make it A LOT clearer what the different states are right here...
            // afaik:
            // 1. client -> server: sending early data
            // 2. client -> server: first packet ever sent (Initial) -> ideally, this should be the first if-test then...
            // 3. client -> server 
                // 3.1 IF session is being reused : same as 1.
                // 3.2 step "3" in the handshake process: client is fully setup but haven't heard final from server yet : normal data from client -> server
            // 4. server -> client: handhsake packet in response to clientInitial 
            
            //console.log("//////////////////////////////////////////////////////////////////");
            //console.log("Trying to create initial:", this.connection.getStreamManager().getStream(0).getLocalOffset().toNumber(), this.connection.getStreamManager().getStream(0).getRemoteOffset().toNumber(), isServer, isHandshake );
            // localoffset : how much we've successfully read from this stream
            // remoteOffset : how much we've written on this stream (not SENT, is incremented as we add data to stream, not send from it)
            // so, for server, we cannot use either...
            //console.log("//////////////////////////////////////////////////////////////////");

            if (this.connection.getQuicTLS().isEarlyDataAllowed() && !isHandshake && !isServer) {
                return PacketFactory.createProtected0RTTPacket(this.connection, frames);
            } else if (this.connection.getStreamManager().getStream(0).getLocalOffset().equals(0) && !isServer && isHandshake) {
                return PacketFactory.createInitialPacket(this.connection, frames);
            } 
            else if(isServer && isHandshake && !this.serverHasSentInitial){
                this.serverHasSentInitial = true; // TODO: FIXME: this is dirty and should be corrected ASAP! 
                return PacketFactory.createInitialPacket(this.connection, frames);
                
            }else if (!isHandshake && ((this.connection.getQuicTLS().isEarlyDataAllowed() && this.connection.getQuicTLS().isSessionReused()) || (handshakeState >= HandshakeState.CLIENT_COMPLETED))) {
                return PacketFactory.createShortHeaderPacket(this.connection, frames); 
            } else {
                // REFACTOR TODO: should only send 3 handshake packets without client address validation
                // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.3
                return PacketFactory.createHandshakePacket(this.connection, frames);
            }
        } else {
            return PacketFactory.createShortHeaderPacket(this.connection, frames);
        }
    }

    public getFrames(maxPayloadSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<CryptoFrame>();
        var uniAdded = false;
        var bidiAdded = false;

        if (this.connection.getRemoteTransportParameters() === undefined) {
            var stream = this.connection.getStreamManager().getStream(new Bignum(0));
            handshakeFrames = handshakeFrames.concat(this.getStreamFrames(stream, maxPayloadSize).handshakeFrames);
        } else if (this.connection.isRemoteLimitExceeded()) {
            flowControlFrames.push(FrameFactory.createBlockedFrame(this.connection.getRemoteOffset()));
            this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
                if (stream.isRemoteLimitExceeded()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                } 
                if (this.isRemoteStreamIdBlocked(stream)) {
                    if (Stream.isUniStreamId(stream.getStreamID()) && !uniAdded) {
                        var frame = this.addRemoteStreamIdBlocked(stream);
                        flowControlFrames.push(frame);
                        uniAdded = true;
                    } else if (Stream.isBidiStreamId(stream.getStreamID()) && !bidiAdded) {
                        var frame = this.addRemoteStreamIdBlocked(stream);
                        flowControlFrames.push(frame);
                        bidiAdded = true;
                    }
                }
            });
        } else {
            this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
                if (stream.isRemoteLimitExceeded()) {
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                    return;
                } 
                if (this.isRemoteStreamIdBlocked(stream)) {
                    if (Stream.isUniStreamId(stream.getStreamID()) && !uniAdded) {
                        var frame = this.addRemoteStreamIdBlocked(stream);
                        flowControlFrames.push(frame);
                        uniAdded = true;
                    } else if (Stream.isBidiStreamId(stream.getStreamID()) && !bidiAdded) {
                        var frame = this.addRemoteStreamIdBlocked(stream);
                        flowControlFrames.push(frame);
                        bidiAdded = true;
                    }
                    return;
                }
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
        var handshakeFrames = new Array<CryptoFrame>();

        if (!stream.getStreamID().equals(0) && (stream.isRemoteLimitExceeded())) {
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
        var handshakeFrames = new Array<CryptoFrame>();

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

            if (stream.getStreamID().equals(0)) {
                let streamData = stream.popData(streamDataSize.toNumber());
                let frame = (FrameFactory.createCryptoFrame(streamData.slice(0, streamDataSize.toNumber()), stream.getRemoteOffset()));
                handshakeFrames.push(frame);
            } else {
                var streamData = stream.popData(streamDataSize.toNumber());
                var isFin = stream.getRemoteFinalOffset() !== undefined ? stream.getRemoteFinalOffset().equals(stream.getRemoteOffset().add(streamDataSize)) : false;
                var frame = (FrameFactory.createStreamFrame(stream.getStreamID(), streamData.slice(0, streamDataSize.toNumber()), isFin, true, stream.getRemoteOffset()));
            
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
            return streamId.greaterThan(this.connection.getRemoteMaxStreamUni());
        } else {
            return streamId.greaterThan(this.connection.getRemoteMaxStreamBidi());
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
    handshakeFrames: CryptoFrame[]
};
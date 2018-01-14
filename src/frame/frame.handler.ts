import {logMethod} from '../utilities/decorators/log.decorator';
import {Stream} from '../types/stream';
import {HandshakeValidation} from '../utilities/validation/handshake.validation';
import {Connection} from '../types/connection';
import {BaseFrame, FrameType} from './base.frame';
import {RstStreamFrame} from './general/rst.stream';
import {ConnectionCloseFrame, ApplicationCloseFrame} from './general/close';
import {MaxDataFrame} from './general/max.data';
import {MaxStreamFrame} from './general/max.stream';
import {MaxStreamIdFrame} from './general/max.stream.id';
import {PingFrame, PongFrame} from './general/ping';
import {BlockedFrame} from './general/blocked';
import {StreamBlockedFrame} from './general/stream.blocked';
import {StreamIdBlockedFrame} from './general/stream.id.blocked';
import {NewConnectionIdFrame} from './general/new.connection.id';
import {StopSendingFrame} from './general/stop.sending';
import {AckFrame} from './general/ack';
import {StreamFrame} from './general/stream';
import {PacketFactory} from '../packet/packet.factory';
import {Bignum} from '../types/bignum';
import {HandshakeState} from '../crypto/qtls';
import {EndpointType} from '../types/endpoint.type';
import {TransportParameters, TransportParameterType} from '../crypto/transport.parameters';
import {BasePacket} from '../packet/base.packet';


export class FrameHandler {

    private handshakeValidator: HandshakeValidation;

    public constructor() {
        this.handshakeValidator = new HandshakeValidation();
    }

    public handle(connection: Connection, frame: BaseFrame) {
        switch (frame.getType()) {
            case FrameType.PADDING:
                break;
            case FrameType.RST_STREAM:
                var rstStreamFrame = <RstStreamFrame>frame;
                this.handleRstStreamFrame(connection, rstStreamFrame);
                break;
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame = <ConnectionCloseFrame>frame;
                this.handleConnectionCloseFrame(connection, connectionCloseFrame);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame = <ApplicationCloseFrame>frame;
                this.handleApplicationCloseFrame(connection, applicationCloseFrame);
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame = <MaxDataFrame>frame;
                this.handleMaxDataFrame(connection, maxDataFrame);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxDataStreamFrame = <MaxStreamFrame>frame;
                this.handleMaxStreamDataFrame(connection, maxDataStreamFrame);
                break;
            case FrameType.MAX_STREAM_ID:
                var maxStreamIdFrame = <MaxStreamIdFrame>frame;
                this.handleMaxStreamIdFrame(connection, maxStreamIdFrame);
                break;
            case FrameType.PING:
                var pingFrame = <PingFrame>frame;
                this.handlePingFrame(connection, pingFrame);
                break;
            case FrameType.BLOCKED:
                var blockedFrame = <BlockedFrame>frame;
                this.handleBlockedFrame(connection, blockedFrame);
                break;
            case FrameType.STREAM_BLOCKED:
                var streamBlocked = <StreamBlockedFrame>frame;
                this.handleStreamBlockedFrame(connection, streamBlocked);
                break;
            case FrameType.STREAM_ID_BLOCKED:
                var streamIdBlocked = <StreamIdBlockedFrame>frame;
                this.handleStreamIdBlockedFrame(connection, streamIdBlocked);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame = <NewConnectionIdFrame>frame;
                this.handleNewConnectionIdFrame(connection, newConnectionIdFrame);
                break;
            case FrameType.STOP_SENDING:
                var stopSendingFrame = <StopSendingFrame>frame;
                this.handleStopSendingFrame(connection, stopSendingFrame);
                break;
            case FrameType.PONG:
                var pongFrame = <PongFrame>frame;
                this.handlePongFrame(connection, pongFrame);
                break;
            case FrameType.ACK:
                var ackFrame = <AckFrame>frame;
                this.handleAckFrame(connection, ackFrame);
                break;
        }
        if (frame.getType() >= FrameType.STREAM) {
            var streamFrame = <StreamFrame>frame;
            this.handleStreamFrame(connection, streamFrame);
        }
    }

    private handleRstStreamFrame(connection: Connection, rstStreamFrame: RstStreamFrame) {

    }
    private handleConnectionCloseFrame(connection: Connection, connectionCloseFrame: ConnectionCloseFrame) {

    }
    private handleApplicationCloseFrame(connection: Connection, applicationCloseFrame: ApplicationCloseFrame) {

    }

    private handleMaxDataFrame(connection: Connection, maxDataFrame: MaxDataFrame) {
        if (connection.getRemoteMaxData().lessThan(maxDataFrame.getMaxData())) {
            connection.setRemoteMaxData(maxDataFrame.getMaxData());
        }
        var shortHeaderPacket = PacketFactory.createShortHeaderPacket(connection, connection.getFlowControl().getAllBufferedStreamFrames());
        connection.sendPacket(shortHeaderPacket);
    }

    private handleMaxStreamDataFrame(connection: Connection, maxDataStreamFrame: MaxStreamFrame) {
        var stream = connection.getStream(maxDataStreamFrame.getStreamId());
        if (stream.getRemoteMaxData().lessThan(maxDataStreamFrame.getMaxData())) {
            stream.setRemoteMaxData(maxDataStreamFrame.getMaxData());
            stream.setBlockedSent(false);
        }
        var shortHeaderPacket = PacketFactory.createShortHeaderPacket(connection, connection.getFlowControl().getBufferedStreamFrames(stream.getStreamID()));
        connection.sendPacket(shortHeaderPacket);
    }

    private handleMaxStreamIdFrame(connection: Connection, maxStreamIdFrame: MaxStreamIdFrame) {

    }

    private handlePingFrame(connection: Connection, pingFrame: PingFrame) {

    }

    private handleBlockedFrame(connection: Connection, blockedFrame: BlockedFrame) {
        
    }

    private handleStreamBlockedFrame(connection: Connection, streamBlocked: StreamBlockedFrame) {

    }

    private handleStreamIdBlockedFrame(connection: Connection, streamIdBlocked: StreamIdBlockedFrame) {

    }

    private handleNewConnectionIdFrame(connection: Connection, newConnectionIdFrame: NewConnectionIdFrame) {

    }

    private handleStopSendingFrame(connection: Connection, stopSendingFrame: StopSendingFrame) {

    }

    private handlePongFrame(connection: Connection, pongFrame: PongFrame) {

    }

    private handleAckFrame(connection: Connection, ackFrame: AckFrame) {

    }

    private handleStreamFrame(connection: Connection, streamFrame: StreamFrame): void {
        var stream = connection.getStream(streamFrame.getStreamID());
        if (stream.getLocalOffset().greaterThan(streamFrame.getOffset())) {
            return;
        }
        
        if (stream.getLocalOffset().lessThan(streamFrame.getOffset())) {
            // TODO: check less than ==> buffer
            return;
        }
        stream.addLocalOffset(streamFrame.getLength());

        if (streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
            this.handleTlsStreamFrame(connection, stream, streamFrame);
        } else if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            this.handleRegularStreamFrame(connection, stream, streamFrame);
        }
    }

    private handleTlsStreamFrame(connection: Connection, stream: Stream, streamFrame: StreamFrame): void {
        connection.getQuicTLS().writeHandshake(connection, streamFrame.getData());
        var data = connection.getQuicTLS().readHandshake();
        if (data.byteLength > 0) {
            if (connection.getQuicTLS().getHandshakeState() === HandshakeState.HANDSHAKE || connection.getEndpointType() === EndpointType.Client) {
                var extensionData = connection.getQuicTLS().getExtensionData();
                var transportParameters: TransportParameters = this.handshakeValidator.validateExtensionData(connection, extensionData);
                connection.setRemoteTransportParameters(transportParameters);
                connection.setRemoteMaxData(transportParameters.getTransportParameter(TransportParameterType.MAX_DATA));
            }

            var str = new StreamFrame(streamFrame.getStreamID(), data);
            str.setOffset(stream.getRemoteOffset());
            str.setLength(Bignum.fromNumber(data.byteLength));

            var packet: BasePacket;
            if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED && connection.getEndpointType() === EndpointType.Server) {
                packet = PacketFactory.createShortHeaderPacket(connection, [str]);
                connection.sendPacket(packet);
            } else {
                packet = PacketFactory.createHandshakePacket(connection, [str]);
                connection.sendPacket(packet);
            }
        }
    }

    private handleRegularStreamFrame(connection: Connection, stream: Stream, streamFrame: StreamFrame): void {

        stream.emit("data",streamFrame.getData());
        if (streamFrame.getFin()) {
            stream.setLocalFinalOffset(stream.getLocalOffset());
            stream.emit("end");
        }
    }
}
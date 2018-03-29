import {logMethod} from '../decorators/log.decorator';
import {Stream, StreamState, StreamEvent, StreamType} from '../../quicker/stream';
import {HandshakeValidation} from '../validation/handshake.validation';
import {Connection, ConnectionState, ConnectionEvent} from '../../quicker/connection';
import {BaseFrame, FrameType} from '../../frame/base.frame';
import {RstStreamFrame} from '../../frame/rst.stream';
import {ConnectionCloseFrame, ApplicationCloseFrame} from '../../frame/close';
import {MaxDataFrame} from '../../frame/max.data';
import {MaxStreamFrame} from '../../frame/max.stream';
import {MaxStreamIdFrame} from '../../frame/max.stream.id';
import {PingFrame, PongFrame} from '../../frame/ping';
import {BlockedFrame} from '../../frame/blocked';
import {StreamBlockedFrame} from '../../frame/stream.blocked';
import {StreamIdBlockedFrame} from '../../frame/stream.id.blocked';
import {NewConnectionIdFrame} from '../../frame/new.connection.id';
import {StopSendingFrame} from '../../frame/stop.sending';
import {AckFrame} from '../../frame/ack';
import {StreamFrame} from '../../frame/stream';
import {PacketFactory} from '../factories/packet.factory';
import {Bignum} from '../../types/bignum';
import {HandshakeState} from '../../crypto/qtls';
import {EndpointType} from '../../types/endpoint.type';
import {TransportParameters, TransportParameterType} from '../../crypto/transport.parameters';
import {BasePacket} from '../../packet/base.packet';
import { FrameFactory } from '../factories/frame.factory';
import { Constants } from '../constants';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { PacketLogging } from '../logging/packet.logging';


export class FrameHandler {

    public constructor() {
        //
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
        var streamId = rstStreamFrame.getStreamId();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }
        var stream = connection.getStream(rstStreamFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.RemoteClosed);
        } else if (stream.getStreamState() === StreamState.LocalClosed) {
            stream.setStreamState(StreamState.Closed);
        }
    }
    private handleConnectionCloseFrame(connection: Connection, connectionCloseFrame: ConnectionCloseFrame) {
        // incoming connectionclose means that the other endpoint is already in its closing state.
        // it is safe to set the state to draining then.
        connection.setState(ConnectionState.Draining);
        connection.closeRequested();
        //var frame: ConnectionCloseFrame = FrameFactory.createConnectionCloseFrame();
    }
    private handleApplicationCloseFrame(connection: Connection, applicationCloseFrame: ApplicationCloseFrame) {
        // incoming connectionclose means that the other endpoint is already in its closing state.
        // it is safe to set the state to draining then.
        connection.setState(ConnectionState.Draining);
        connection.closeRequested();
        //var frame: ConnectionCloseFrame = FrameFactory.createApplicationCloseFrame();
    }

    private handleMaxDataFrame(connection: Connection, maxDataFrame: MaxDataFrame) {
        if (connection.getRemoteMaxData().lessThan(maxDataFrame.getMaxData())) {
            connection.setRemoteMaxData(maxDataFrame.getMaxData());
        }
    }

    private handleMaxStreamDataFrame(connection: Connection, maxDataStreamFrame: MaxStreamFrame) {
        var streamId = maxDataStreamFrame.getStreamId();
        if (Stream.isReceiveOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }
        if (Stream.isSendOnly(connection.getEndpointType(), streamId) && !connection.hasStream(streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }

        var stream = connection.getStream(maxDataStreamFrame.getStreamId());
        if (stream.getRemoteMaxData().lessThan(maxDataStreamFrame.getMaxData())) {
            stream.setRemoteMaxData(maxDataStreamFrame.getMaxData());
            stream.setBlockedSent(false);
        }
    }

    private handleMaxStreamIdFrame(connection: Connection, maxStreamIdFrame: MaxStreamIdFrame) {
        if (maxStreamIdFrame.getMaxStreamId().and(new Bignum(0x2)).equals(new Bignum(2))) {
            connection.setRemoteMaxStreamUni(maxStreamIdFrame.getMaxStreamId());
        } else {
            connection.setRemoteMaxStreamBidi(maxStreamIdFrame.getMaxStreamId());
        }
    }

    private handlePingFrame(connection: Connection, pingFrame: PingFrame) {
        if (pingFrame.getLength() > 0) {
            var pongFrame = FrameFactory.createPongFrame(pingFrame.getLength(), pingFrame.getData());
            connection.queueFrame(pongFrame);
        }
    }

    private handleBlockedFrame(connection: Connection, blockedFrame: BlockedFrame) {
        connection.setIsRemoteBlocked(true);
    }

    private handleStreamBlockedFrame(connection: Connection, streamBlocked: StreamBlockedFrame) {
        var streamId = streamBlocked.getStreamId();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }

        var streamId = streamBlocked.getStreamId()
        connection.getStream(streamId).setIsRemoteBlocked(true);
    }

    private handleStreamIdBlockedFrame(connection: Connection, streamIdBlockedFrame: StreamIdBlockedFrame) {
        if (streamIdBlockedFrame.getStreamId().and(new Bignum(0x2)).equals(new Bignum(2))) {
            connection.setLocalMaxStreamUniBlocked(true);
        } else {
            connection.setLocalMaxStreamBidiBlocked(true);
        }
    }

    private handleNewConnectionIdFrame(connection: Connection, newConnectionIdFrame: NewConnectionIdFrame) {
        
    }

    private handleStopSendingFrame(connection: Connection, stopSendingFrame: StopSendingFrame) {
        var streamId = stopSendingFrame.getStreamId();
        if (Stream.isReceiveOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }

        var stream = connection.getStream(stopSendingFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.LocalClosed);
        } else if (stream.getStreamState() === StreamState.RemoteClosed) {
            stream.setStreamState(StreamState.Closed);
        }
        stream.setRemoteFinalOffset(stream.getRemoteOffset());
        var rstStreamFrame = FrameFactory.createRstStreamFrame(stream.getStreamID(), 0, stream.getRemoteFinalOffset());
    }

    private handlePongFrame(connection: Connection, pongFrame: PongFrame) {
        if (pongFrame.getLength() === 0) {
            throw new QuicError(ConnectionErrorCodes.FRAME_ERROR + FrameType.PONG);
        }
        // not yet checking with pingframes sent, because these aren't kept at the moment 
        // draft states: the endpoint MAY generate a connection error of type UNSOLICITED_PONG
        // so not doing anything at the moment
    }

    private handleAckFrame(connection: Connection, ackFrame: AckFrame) {
        connection.getLossDetection().onAckReceived(ackFrame);
    }

    private handleStreamFrame(connection: Connection, streamFrame: StreamFrame): void {
        var streamId = streamFrame.getStreamID();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }
        var stream = connection.getStream(streamFrame.getStreamID());
        stream.receiveData(streamFrame.getData(), streamFrame.getOffset(), streamFrame.getFin());
    }
}
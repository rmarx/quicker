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
import {PingFrame} from '../../frame/ping';
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
import { PathChallengeFrame, PathResponseFrame } from '../../frame/path';


export class FrameHandler {

    public constructor() {
        //
    }

    public handle(connection: Connection, frame: BaseFrame) {
        switch (frame.getType()) {
            // Connection management
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame = <ConnectionCloseFrame>frame;
                this.handleConnectionCloseFrame(connection, connectionCloseFrame);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame = <ApplicationCloseFrame>frame;
                this.handleApplicationCloseFrame(connection, applicationCloseFrame);
                break;
            case FrameType.PATH_CHALLENGE:
                var pathChallengeFrame = <PathChallengeFrame>frame;
                this.handlePathChallengeFrame(connection, pathChallengeFrame);
                break;
            case FrameType.PATH_RESPONSE:
                var pathResponseFrame = <PathResponseFrame>frame;
                this.handlePathResponseFrame(connection, pathResponseFrame);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame = <NewConnectionIdFrame>frame;
                this.handleNewConnectionIdFrame(connection, newConnectionIdFrame);
                break;

            // Traffic control 
            case FrameType.ACK:
                var ackFrame = <AckFrame>frame;
                this.handleAckFrame(connection, ackFrame);
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
            case FrameType.STOP_SENDING:
                var stopSendingFrame = <StopSendingFrame>frame;
                this.handleStopSendingFrame(connection, stopSendingFrame);
                break;
            
            case FrameType.PADDING:
                break;
            case FrameType.RST_STREAM:
                var rstStreamFrame = <RstStreamFrame>frame;
                this.handleRstStreamFrame(connection, rstStreamFrame);
                break;
        }
        if (frame.getType() >= FrameType.STREAM) {
            var streamFrame = <StreamFrame>frame;
            this.handleStreamFrame(connection, streamFrame);
        }
    }

    private handleRstStreamFrame(connection: Connection, rstStreamFrame: RstStreamFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.3
        var streamId = rstStreamFrame.getStreamId();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "RST frame received on our send-only stream " + streamId); // this will close the connection
        }

        // REFACTOR TODO: first check if stream exists... this will create the stream if doesn't exist and then keep it floating about
        // REFACTOR TODO: we should bubble this up to the application level, since resetting of streams happens at application logic level (error-code is app-specific, not transport-specific)
        var stream = connection.getStreamManager().getStream(rstStreamFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.RemoteClosed);
        } else if (stream.getStreamState() === StreamState.LocalClosed) {
            stream.setStreamState(StreamState.Closed);
        }
        else
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "RST frame received for stream in invalid state " + streamId + " // " + stream.getStreamState() );
    }
    private handleConnectionCloseFrame(connection: Connection, connectionCloseFrame: ConnectionCloseFrame) {
        // incoming ConnectionClose means that the other endpoint is already in its closing state.
        // it is safe to set the state to draining then.
        // REFACTOR TODO: spec allows us to send a CLOSE frame before going to Draining, maybe this is better (more explicit)? #6.10.3
        connection.setState(ConnectionState.Draining);
        connection.closeRequested();
    }
    private handleApplicationCloseFrame(connection: Connection, applicationCloseFrame: ApplicationCloseFrame) {
        // incoming ApplicationClose means that the other endpoint is already in its closing state.
        // it is safe to set the state to draining then.
        // REFACTOR TODO: spec allows us to send a CLOSE frame before going to Draining, maybe this is better (more explicit)? #6.10.3
        connection.setState(ConnectionState.Draining);
        connection.closeRequested();
    }

    private handleMaxDataFrame(connection: Connection, maxDataFrame: MaxDataFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.6
        // ignore if it is less than what we already had gotten 
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-10 "A receiver MUST NOT renege on an advertisement"
        if (connection.getRemoteMaxData().lessThan(maxDataFrame.getMaxData())) {
            connection.setRemoteMaxData(maxDataFrame.getMaxData());
        }
    }

    private handleMaxStreamDataFrame(connection: Connection, maxDataStreamFrame: MaxStreamFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.7
        var streamId = maxDataStreamFrame.getStreamId();
        // maxdata is needed for sending, we cannot send on a receive-only stream
        if (Stream.isReceiveOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }
        // valid stream, but we haven't opened it yet, shouldn't happen
        if (Stream.isSendOnly(connection.getEndpointType(), streamId) && !connection.getStreamManager().hasStream(streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }

        // note: if this is a bidi stream that we haven't opened yet, this will implicitly open the stream
        var stream = connection.getStreamManager().getStream(maxDataStreamFrame.getStreamId());
        if (stream.getRemoteMaxData().lessThan(maxDataStreamFrame.getMaxData())) {
            stream.setRemoteMaxData(maxDataStreamFrame.getMaxData());
            stream.setBlockedSent(false);
        }
    }

    private handleMaxStreamIdFrame(connection: Connection, maxStreamIdFrame: MaxStreamIdFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.8
        // if 2nd lsb is set, it's for a unidirectional stream, otherwhise a bidirectional stream
        // see also https://tools.ietf.org/html/draft-ietf-quic-transport#section-9.1 and stream.ts 
        // REFACTOR TODO: use Stream.isUniStreamId helper function
        // REFACTOR TODO: if this value is lower than a previously received one, we should ignore it (see #7.8)
        if (maxStreamIdFrame.getMaxStreamId().and(new Bignum(0x2)).equals(new Bignum(2))) {
            connection.setRemoteMaxStreamUni(maxStreamIdFrame.getMaxStreamId());
        } else {
            connection.setRemoteMaxStreamBidi(maxStreamIdFrame.getMaxStreamId());
        }
    }

    private handlePingFrame(connection: Connection, pingFrame: PingFrame) {
        // Nothing to do here, ping is only used to keep a connection alive (restarts our idleTimeout)
        // The frame will be ACKed by flow/congestion control, which implicitly allows for the keepalive
    }

    private handleBlockedFrame(connection: Connection, blockedFrame: BlockedFrame) {
        // sent by peer in reaction to MAX_DATA being reached
        // this will flag our flow control that it should send an update ASAP
        connection.setIsRemoteBlocked(true);
    }

    private handleStreamBlockedFrame(connection: Connection, streamBlocked: StreamBlockedFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.11
        var streamId = streamBlocked.getStreamId();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }

        // TODO: this will implicitly open the stream if it's currently closed... seems counter-intuitive... spec doesn't mention this edge case yet in -12
        var streamId = streamBlocked.getStreamId();
        connection.getStreamManager().getStream(streamId).setIsRemoteBlocked(true);
    }

    private handleStreamIdBlockedFrame(connection: Connection, streamIdBlockedFrame: StreamIdBlockedFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.12
        // if 2nd lsb is set, it's for a unidirectional stream, otherwhise a bidirectional stream
        // see also https://tools.ietf.org/html/draft-ietf-quic-transport#section-9.1 and stream.ts 
        // REFACTOR TODO: use Stream.isUniStreamId helper function
        if (streamIdBlockedFrame.getStreamId().and(new Bignum(0x2)).equals(new Bignum(2))) {
            connection.setLocalMaxStreamUniBlocked(true);
        } else {
            connection.setLocalMaxStreamBidiBlocked(true);
        }
    }

    private handleNewConnectionIdFrame(connection: Connection, newConnectionIdFrame: NewConnectionIdFrame) {
        // TODO: implement this
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.1
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.13
        // use connection.mappedConnections for this maybe? 
    }

    private handleStopSendingFrame(connection: Connection, stopSendingFrame: StopSendingFrame) {
        // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.14
        var streamId = stopSendingFrame.getStreamId();

        if (Stream.isReceiveOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }

        // TODO: spec also mentions other conditions under which we have to send PROTOCOL_VIOLATION:
        // Receipt of a STOP_SENDING frame is only valid for a send stream that
        // exists and is not in the "Ready" state (see Section 9.2.1).
        // Receiving a STOP_SENDING frame for a send stream that is "Ready" or
        // non-existent MUST be treated as a connection error of type
        // PROTOCOL_VIOLATION.

        var stream = connection.getStreamManager().getStream(stopSendingFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.LocalClosed);
        } else if (stream.getStreamState() === StreamState.RemoteClosed) {
            stream.setStreamState(StreamState.Closed);
        }
        stream.setRemoteFinalOffset(stream.getRemoteOffset());
        var rstStreamFrame = FrameFactory.createRstStreamFrame(stream.getStreamID(), 0, stream.getRemoteFinalOffset());
        // VERIFY TODO: here, the RST frame is created, but not actually sent? what is the logic here? 
    }

    private handleAckFrame(connection: Connection, ackFrame: AckFrame) {
        connection.getLossDetection().onAckReceived(ackFrame);
    }

    private handlePathChallengeFrame(connection: Connection, pathChallengeFrame: PathChallengeFrame) {
        var pathResponse = FrameFactory.createPathResponseFrame(pathChallengeFrame.getData());
        connection.queueFrame(pathResponse);
    }

    private handlePathResponseFrame(connection: Connection, pathResponseFrame: PathResponseFrame) {
        //TODO: check if we have send a path challenge frame; if true: check if data is same; else throw UNSOLICITED_PATH_RESPONSE
    }

    private handleStreamFrame(connection: Connection, streamFrame: StreamFrame): void {
        var streamId = streamFrame.getStreamID();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }
        var stream = connection.getStreamManager().getStream(streamFrame.getStreamID());
        stream.receiveData(streamFrame.getData(), streamFrame.getOffset(), streamFrame.getFin());
    }
}
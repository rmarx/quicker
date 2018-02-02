import {logMethod} from '../utilities/decorators/log.decorator';
import {Stream, StreamState} from '../types/stream';
import {HandshakeValidation} from '../utilities/validation/handshake.validation';
import {Connection, ConnectionState} from '../types/connection';
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
import { FrameFactory } from './frame.factory';
import { Constants } from '../utilities/constants';


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
        if (pingFrame.getLength() > 0) {
            var pongFrame = FrameFactory.createPongFrame(pingFrame.getData());
            var shortHeaderPacket = PacketFactory.createShortHeaderPacket(connection, [pongFrame]);
            connection.sendPacket(shortHeaderPacket);
        }
    }

    private handleBlockedFrame(connection: Connection, blockedFrame: BlockedFrame) {
        var maxDataFrame = FrameFactory.createMaxDataFrame(connection);
        connection.setLocalMaxData(maxDataFrame.getMaxData());
        var shortHeaderPacket = PacketFactory.createShortHeaderPacket(connection, [maxDataFrame]);
        connection.sendPacket(shortHeaderPacket);
    }

    private handleStreamBlockedFrame(connection: Connection, streamBlocked: StreamBlockedFrame) {
        var stream = connection.getStream(streamBlocked.getStreamId());
        var maxStreamDataFrame = FrameFactory.createMaxStreamDataFrame(stream);
        stream.setLocalMaxData(maxStreamDataFrame.getMaxData());
        var shortHeaderPacket = PacketFactory.createShortHeaderPacket(connection, [maxStreamDataFrame]);
        connection.sendPacket(shortHeaderPacket);
    }

    private handleStreamIdBlockedFrame(connection: Connection, streamIdBlocked: StreamIdBlockedFrame) {

    }

    private handleNewConnectionIdFrame(connection: Connection, newConnectionIdFrame: NewConnectionIdFrame) {
        
    }

    private handleStopSendingFrame(connection: Connection, stopSendingFrame: StopSendingFrame) {
        var stream = connection.getStream(stopSendingFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.LocalClosed);
        } else if (stream.getStreamState() === StreamState.RemoteClosed) {
            stream.setStreamState(StreamState.Closed);
        }
        stream.setRemoteFinalOffset(stream.getRemoteOffset());
        var rstStreamFrame = FrameFactory.createRstStreamFrame(stream, 0);
    }

    private handlePongFrame(connection: Connection, pongFrame: PongFrame) {
        if (pongFrame.getLength() === 0) {
            throw Error("FRAME_ERROR");
        }
        // not yet checking with pingframes sent, because these aren't kept at the moment 
        // draft states: the endpoint MAY generate a connection error of type UNSOLICITED_PONG
        // so not doing anything at the moment
    }

    private handleAckFrame(connection: Connection, ackFrame: AckFrame) {

    }

    private handleStreamFrame(connection: Connection, streamFrame: StreamFrame): void {
        var stream = connection.getStream(streamFrame.getStreamID());

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
                var transportParameters: TransportParameters = HandshakeValidation.validateExtensionData(connection, extensionData);
                connection.setRemoteTransportParameters(transportParameters);
                connection.setRemoteMaxData(transportParameters.getTransportParameter(TransportParameterType.MAX_DATA));
            }

            var packet: BasePacket;
            if (connection.getEndpointType() === EndpointType.Client || connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
                var str = new StreamFrame(streamFrame.getStreamID(), data);
                str.setOffset(stream.getRemoteOffset());
                str.setLength(Bignum.fromNumber(data.byteLength));
                if (connection.getEndpointType() === EndpointType.Client) {
                    packet = PacketFactory.createHandshakePacket(connection, [str]);
                } else {
                    packet = PacketFactory.createShortHeaderPacket(connection, [str]);
                }
                connection.sendPacket(packet);
            } else {
                var dataBuffers: Buffer[] = [];
                var i = 0;
                while(i * Constants.CLIENT_INITIAL_MIN_SIZE < data.byteLength) {
                    var size = (i+1) * Constants.CLIENT_INITIAL_MIN_SIZE < data.byteLength ? Constants.CLIENT_INITIAL_MIN_SIZE : (i+1) * Constants.CLIENT_INITIAL_MIN_SIZE - data.byteLength;
                    var buffer = Buffer.alloc(size);
                    data.copy(buffer, 0, i * Constants.CLIENT_INITIAL_MIN_SIZE, i * Constants.CLIENT_INITIAL_MIN_SIZE + size);
                    dataBuffers.push(buffer);
                    i++;
                }
                dataBuffers.forEach((buf: Buffer) => {
                    var str = new StreamFrame(streamFrame.getStreamID(), buf);
                    str.setOffset(stream.getRemoteOffset());
                    str.setLength(Bignum.fromNumber(buf.byteLength));
                    packet = PacketFactory.createHandshakePacket(connection, [str]);
                    connection.sendPacket(packet);
                });
            }
        }
    }

    private handleRegularStreamFrame(connection: Connection, stream: Stream, streamFrame: StreamFrame): void {
        stream.emit("data",streamFrame.getData());
        if (streamFrame.getFin()) {
            stream.setLocalFinalOffset(stream.getLocalOffset());
            if (stream.getStreamState() === StreamState.Open) {
                stream.setStreamState(StreamState.LocalClosed);
            } else if (stream.getStreamState() === StreamState.RemoteClosed) {
                stream.setStreamState(StreamState.Closed);
            }
            stream.emit("end");
        }
    }
}
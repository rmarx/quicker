import {Connection} from '../types/connection';
import {BaseFrame, FrameType} from './base.frame';
import {StreamFrame} from './general/stream';
import {Bignum} from '../types/bignum';
import {TransportParameterType, TransportParameters} from '../crypto/transport.parameters';
import {BasePacket} from '../packet/base.packet';
import {HandshakeState} from '../crypto/qtls';
import {Stream} from "./../types/stream";
import {EndpointType} from '../types/endpoint.type';
import {PacketFactory} from '../packet/packet.factory';
import { Constants } from './../utilities/constants';
import { HandshakeValidation } from './../validation/handshake.validation';
import { MaxDataFrame } from './general/max.data';
import { MaxStreamFrame } from './general/max.stream';



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
                break;
            case FrameType.CONNECTION_CLOSE:
                break;
            case FrameType.APPLICATION_CLOSE:
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame = <MaxDataFrame> frame;
                this.handleMaxDataFrame(connection, maxDataFrame);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxDataStreamFrame = <MaxStreamFrame> frame;
                this.handleMaxStreamDataFrame(connection, maxDataStreamFrame);
                break;
            case FrameType.MAX_STREAM_ID:
                break;
            case FrameType.PING:
                break;
            case FrameType.BLOCKED:
                break;
            case FrameType.STREAM_BLOCKED:
                break;
            case FrameType.STREAM_ID_BLOCKED:
                break;
            case FrameType.NEW_CONNECTION_ID:
                break;
            case FrameType.STOP_SENDING:
                break;
            case FrameType.PONG:
                break;
            case FrameType.ACK:
                break;
        }
        if (frame.getType() >= FrameType.STREAM) {
            var streamFrame = <StreamFrame>frame;
            if (streamFrame.getStreamID().equals(Bignum.fromNumber(0))) {
                this.handleTlsStreamFrames(connection, streamFrame);
            } else {
                this.handleRegularStreamFrames(connection, streamFrame);
            }
        }
    }

    private handleMaxDataFrame(connection: Connection, maxDataFrame: MaxDataFrame) {
        if (connection.getRemoteTransportParameter(TransportParameterType.MAX_DATA).lessThan(maxDataFrame.getMaxData())) {
            connection.setRemoteTransportParameter(TransportParameterType.MAX_DATA, maxDataFrame.getMaxData());
        }
    }

    private handleMaxStreamDataFrame(connection: Connection, maxDataStreamFrame: MaxStreamFrame) {
        var stream = connection.getStream(maxDataStreamFrame.getStreamId());
        if (stream.getRemoteMaxStreamData().lessThan(maxDataStreamFrame.getMaxData())) {
            stream.setRemoteMaxStreamData(maxDataStreamFrame.getMaxData());
        }
    }

    private handleTlsStreamFrames(connection: Connection, streamFrame: StreamFrame): void {
        var connectionStream = connection.getStream(streamFrame.getStreamID());
        connection.getQuicTLS().writeHandshake(connection, streamFrame.getData());
        var data = connection.getQuicTLS().readHandshake();
        if (data.byteLength > 0) {
            if (connection.getQuicTLS().getHandshakeState() === HandshakeState.HANDSHAKE || connection.getEndpointType() === EndpointType.Client) {
                var extensionData = connection.getQuicTLS().getExtensionData();
                var transportParameters: TransportParameters = this.handshakeValidator.validateExtensionData(connection, extensionData);
                //TODO validate
                connection.setRemoteTransportParameters(transportParameters);
            }

            var str = new StreamFrame(streamFrame.getStreamID(), data);
            str.setOffset(connectionStream.getRemoteOffset());
            str.setLength(Bignum.fromNumber(data.byteLength));

            var packet: BasePacket;
            if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED && connection.getEndpointType() === EndpointType.Server) {
                packet = PacketFactory.createShortHeaderPacket(connection, [str]);
            } else {
                packet = PacketFactory.createHandshakePacket(connection, [str]);
            }
            if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
                //
            }
            connection.sendPacket(packet);
            connectionStream.addRemoteOffset(Bignum.fromNumber(data.byteLength));
        }
    }

    private handleRegularStreamFrames(connection: Connection, streamFrame: StreamFrame): void {

    }
}
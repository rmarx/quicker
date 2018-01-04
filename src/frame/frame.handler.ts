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



export class FrameHandler {

    private handshakeValidator: HandshakeValidation;

    public constructor() {
        this.handshakeValidator = new HandshakeValidation();
    }

    public handle(connection: Connection, frame: BaseFrame) {
        switch (frame.getType()) {
            case FrameType.PADDING:
            case FrameType.RST_STREAM:
            case FrameType.CONNECTION_CLOSE:
            case FrameType.APPLICATION_CLOSE:
            case FrameType.MAX_DATA:
            case FrameType.MAX_STREAM_DATA:
            case FrameType.MAX_STREAM_ID:
            case FrameType.PING:
            case FrameType.BLOCKED:
            case FrameType.STREAM_BLOCKED:
            case FrameType.STREAM_ID_BLOCKED:
            case FrameType.NEW_CONNECTION_ID:
            case FrameType.STOP_SENDING:
            case FrameType.PONG:
            case FrameType.ACK:
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

    private handleTlsStreamFrames(connection: Connection, streamFrame: StreamFrame): void {
        var connectionStream = connection.getStream(streamFrame.getStreamID());
        if (connectionStream === undefined) {
            connectionStream = new Stream(streamFrame.getStreamID(), Bignum.fromNumber(Constants.DEFAULT_MAX_STREAM_DATA));
            connection.addStream(connectionStream);
        }
        connectionStream.addRemoteOffset(streamFrame.getLength());
        connection.getQuicTLS().writeHandshake(connection, streamFrame.getData());
        var data = connection.getQuicTLS().readHandshake();
        if (data.byteLength > 0) {
            if (connection.getQuicTLS().getHandshakeState() === HandshakeState.HANDSHAKE || connection.getEndpointType() === EndpointType.Client) {
                var extensionData = connection.getQuicTLS().getExtensionData();
                var transportParameters: TransportParameters = this.handshakeValidator.validateExtensionData(connection, extensionData);
                //TODO validate
                if (connection.getEndpointType() === EndpointType.Client) {
                    connection.setServerTransportParameters(transportParameters);
                } else {
                    connection.setClientTransportParameters(transportParameters);
                }
            }

            var str = new StreamFrame(streamFrame.getStreamID(), data);
            str.setOffset(connectionStream.getLocalOffset());
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
        }
    }

    private handleRegularStreamFrames(connection: Connection, streamFrame: StreamFrame): void {

    }
}
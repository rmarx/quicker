import {ConnectionID} from './../types/header.properties';
import {FrameType, BaseFrame} from '../frame/base.frame';
import { Connection } from '../types/connection';
import { BasePacket, PacketType } from './base.packet';
import { HandshakePacket } from './packet/handshake';
import { EndpointType } from '../types/endpoint.type';
import { FrameHandler } from './../frame/frame.handler';
import { StreamFrame } from './../frame/general/stream';
import { PacketFactory } from './packet.factory';
import { Stream } from '../types/stream';
import { Bignum } from '../types/bignum';
import { ClientInitialPacket } from './packet/client.initial';
import { HandshakeState } from './../crypto/qtls';


export class PacketHandler {

    private frameHandler: FrameHandler;

    public constructor() {
        this.frameHandler = new FrameHandler();
    }

    public handle(connection: Connection, packet: BasePacket) {
        switch (packet.getPacketType()) {
            case PacketType.Initial:
                this.handleInitialPacket(connection, packet);
                break;
            case PacketType.Handshake:
                this.handleHandshakePacket(connection, packet);
                break;
        }
    }

    public handleInitialPacket(connection: Connection, packet: BasePacket): void {
        var clientInitialPacket: ClientInitialPacket = <ClientInitialPacket> packet;
        var connectionID = packet.getHeader().getConnectionID();
        if (connectionID === undefined) {
            throw Error("No ConnectionID defined");
        }
        connection.setConnectionID(ConnectionID.randomConnectionID());
        clientInitialPacket.getFrames().forEach((baseFrame: BaseFrame) => {
            this.handleHandshakeFrames(connection, baseFrame);
        });
    }

    public handleHandshakePacket(connection: Connection, packet: BasePacket): void {
        var handshakePacket: HandshakePacket = <HandshakePacket>packet;
        var connectionID = packet.getHeader().getConnectionID();
        if (connectionID === undefined) {
            throw Error("No ConnectionID defined");
        }
        connection.setConnectionID(connectionID);
        handshakePacket.getFrames().forEach((baseFrame: BaseFrame) => {
            this.handleHandshakeFrames(connection, baseFrame);
        });
    }

    private handleHandshakeFrames(connection: Connection, baseFrame: BaseFrame) {
        if (baseFrame.getType() >= FrameType.STREAM) {
            var stream = <StreamFrame> baseFrame;
            var connectionStream = connection.getStream(stream.getStreamID());
            if (connectionStream === undefined) {
                connectionStream = new Stream(stream.getStreamID());
                connection.addStream(connectionStream);
            }
            connectionStream.addRemoteOffset(stream.getLength());
            connection.getQuicTLS().writeHandshake(connection, stream.getData());
            var data = connection.getQuicTLS().readHandshake();
            if (data.byteLength > 0) {
                var str = new StreamFrame(stream.getStreamID(), data);
                str.setOff(true);
                str.setOffset(connectionStream.getLocalOffset());
                str.setLen(true);
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
                connection.getSocket().send(packet.toBuffer(connection), connection.getRemoteInfo().port, connection.getRemoteInfo().address);
            }
            return;
        }
        switch (baseFrame.getType()) {
            case FrameType.PADDING:
            case FrameType.ACK:
                throw Error("Not implemented");
            default:
                //ignore
        }
    }
}
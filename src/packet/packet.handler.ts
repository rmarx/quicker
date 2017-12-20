import {FrameType, BaseFrame} from '../frame/base.frame';
import { Connection } from '../quicker/connection';
import { BasePacket, PacketType } from './base.packet';
import { HandshakePacket } from './packet/handshake';
import { EndpointType } from './../quicker/type';
import { FrameHandler } from './../frame/frame.handler';
import { StreamFrame } from './../frame/general/stream';


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
        throw new Error("Method not implemented.");
    }

    public handleHandshakePacket(connection: Connection, packet: BasePacket): void {
        var handshakePacket: HandshakePacket = <HandshakePacket>packet;
        handshakePacket.getFrames().forEach((baseFrame: BaseFrame) => {

            if (baseFrame.getType() >= FrameType.STREAM) {
                var stream = <StreamFrame> baseFrame;
                connection.getQuicTLS().writeHandshake(stream.getData());
                var data = connection.getQuicTLS().readHandshake();
                var str = new StreamFrame(stream.getStreamID(), data);
                connection.getSocket().send(str.toBuffer(), connection.getRemoteInfo().port, connection.getRemoteInfo().address);
                return;
            }
            switch (baseFrame.getType()) {
                case FrameType.PADDING:
                case FrameType.ACK:
                    throw Error("Not implemented");
                default:
                    //ignore
            }
        });
    }
}
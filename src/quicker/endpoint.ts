import { Connection, ConnectionState } from './connection';
import { ConnectionCloseFrame } from '../frame/close';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { QuicError } from '../utilities/errors/connection.error';
import { FrameFactory } from '../utilities/factories/frame.factory';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { HandshakeState } from '../crypto/qtls';
import { PacketFactory } from '../utilities/factories/packet.factory';
import { QuickerEvent } from './quicker.event';
import { HeaderParser } from '../utilities/parsers/header.parser';
import { HeaderHandler } from '../utilities/handlers/header.handler';
import { EventEmitter } from "events";
import { PacketParser } from '../utilities/parsers/packet.parser';
import { PacketHandler } from '../utilities/handlers/packet.handler';


export abstract class Endpoint extends EventEmitter {
    protected port!: number;
    protected hostname!: string;
    protected options: any;

    protected headerParser: HeaderParser;
    protected packetParser: PacketParser;
    protected headerHandler: HeaderHandler;
    protected packetHandler: PacketHandler;

    protected constructor() {
        super();
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
    }

    public getPort(): number {
        return this.port;
    }

    public getHostname(): string {
        return this.hostname;
    }

    protected handleError(connection: Connection, error: any): any {
        console.log(error.message);
        console.log(error.stack);

        var closeFrame: ConnectionCloseFrame;
        var packet: BaseEncryptedPacket;
        if (error instanceof QuicError) {
            closeFrame = FrameFactory.createConnectionCloseFrame(error.getErrorCode(), error.getPhrase());
        } else {
            closeFrame = FrameFactory.createConnectionCloseFrame(ConnectionErrorCodes.INTERNAL_ERROR);
        }
        if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            packet = PacketFactory.createShortHeaderPacket(connection, [closeFrame]);
        } else {
            packet = PacketFactory.createHandshakePacket(connection, [closeFrame]);
        }
        connection.sendPacket(packet)
        connection.setClosePacket(packet);
        connection.setState(ConnectionState.Closing);
        this.emit(QuickerEvent.ERROR, error);
    }

    protected handleClose(): any {
        this.emit(QuickerEvent.CONNECTION_CLOSE);
    }
}
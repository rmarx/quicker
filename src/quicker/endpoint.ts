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
import { VerboseLogging } from '../utilities/logging/verbose.logging';


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
        VerboseLogging.error("Endpoint:handleError : " + error.message + " -- " + JSON.stringify(error));
        VerboseLogging.error("Endpoint:handleError : " + JSON.stringify(error.stack.toString()));
        console.log(error.stack);

        var closeFrame: ConnectionCloseFrame;
        var packet: BaseEncryptedPacket;
        let aRealError:boolean = true;
        if (error instanceof QuicError) {
            closeFrame = FrameFactory.createConnectionCloseFrame(error.getErrorCode(), error.getPhrase());
            if( error.getErrorCode() === ConnectionErrorCodes.NO_ERROR )
                aRealError = false;
        } else {
            closeFrame = FrameFactory.createConnectionCloseFrame(ConnectionErrorCodes.INTERNAL_ERROR, error.message + " -- " + JSON.stringify(error) + " -- " + JSON.stringify(error.stack) );
        }
        var handshakeState = connection.getQuicTLS().getHandshakeState();
        if (handshakeState === HandshakeState.CLIENT_COMPLETED || handshakeState === HandshakeState.COMPLETED) {
            packet = PacketFactory.createShortHeaderPacket(connection, [closeFrame]);
        } 
        else if( connection.getAEAD().canHandshakeEncrypt(connection.getEndpointType()) ) {
            packet = PacketFactory.createHandshakePacket(connection, [closeFrame]);
        }
        else{
            packet = PacketFactory.createInitialPacket(connection, [closeFrame]);
        }
        
        connection.sendPacket(packet, false)
        connection.setClosePacket(packet);
        connection.setState(ConnectionState.Closing);
        // TODO: right now, we also allow this function to be used for normal closures, which is WAY TOO DIRTY
        if( aRealError )
            this.emit(QuickerEvent.ERROR, error);
    }

    protected handleClose(): any {
        this.emit(QuickerEvent.CONNECTION_CLOSE);
    }
}
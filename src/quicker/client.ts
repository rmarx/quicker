import {PacketNumber, ConnectionID, Version} from '../types/header.properties';
import {PacketHandler} from '../packet/packet.handler';
import {Bignum} from '../types/bignum';
import {Stream} from '../types/stream';
import {Constants} from '../utilities/constants';
import {ClientInitialPacket} from '../packet/packet/client.initial';
import {PacketParser, PacketOffset} from '../packet/packet.parser';
import {PacketFactory} from '../packet/packet.factory';
import {QTLS, HandshakeState} from '../crypto/qtls';
import {VersionNegotiationPacket} from '../packet/packet/version.negotiation';
import {BasePacket} from '../packet/base.packet';
import { Socket, createSocket, RemoteInfo } from 'dgram';
import * as fs from 'fs';
import {EndpointType} from '../types/endpoint.type';
import {ConnectionState, Connection,  RemoteInformation} from '../types/connection';
import { HeaderOffset, HeaderParser } from './../packet/header/header.parser';
import { HeaderHandler } from './../packet/header/header.handler';
import { Time, TimeFormat } from '../utilities/time';
import { PacketLogging } from '../utilities/logging/packet.logging';
import { EventEmitter } from 'events';
import { FrameFactory } from './../frame/frame.factory';
import { QuicError } from "./../utilities/errors/connection.error";
import { ConnectionCloseFrame } from '../frame/general/close';
import { ConnectionErrorCodes } from '../utilities/errors/connection.codes';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';


export class Client extends EventEmitter{
        
    private port: number;
    private hostname: string;

    private headerParser: HeaderParser;
    private packetParser: PacketParser;
    private headerHandler: HeaderHandler;
    private packetHandler: PacketHandler;

    private connection: Connection;

    public constructor() {
        super();
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
    }

    public connect(hostname: string, port: number) {
        this.hostname = hostname;
        this.port = port;
        this.init();

        var packetNumber = PacketNumber.randomPacketNumber();
        this.connection.setLocalPacketNumber(packetNumber);
        var version = new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
        var stream = this.connection.getStream(Bignum.fromNumber(0));
        var clientInitial: ClientInitialPacket = PacketFactory.createClientInitialPacket(this.connection);
        this.connection.sendPacket(clientInitial);
    }

    private init(): void {
        var socket = createSocket("udp4");
        var remoteInfo: RemoteInformation = {
            address: this.hostname,
            port: this.port, 
            family: 'IPv4'
        };
        
        this.connection = new Connection(remoteInfo, EndpointType.Client);
        this.connection.setFirstConnectionID(ConnectionID.randomConnectionID());
        this.connection.setSocket(socket);
        this.setupConnectionEvents();
        
        socket.on('error',(err) => {this.onError(this.connection, err)});
        socket.on('message',(msg, rinfo) => {this.onMessage(msg, rinfo)});
        socket.on('close',() => {this.onClose()});
    }

    private setupConnectionEvents() {
        this.connection.on('con-close', () => {
            process.exit(0);
        })
    }

    public testSend() {
        // Dummy, here comes the part of requesting resources
    }

    public getPort(): number {
        return this.port;
    }
    
    public getHostname(): string {
        return this.hostname;
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        if (this.connection.getState() === ConnectionState.Closing) {
            var closePacket = this.connection.getClosePacket();
            this.connection.sendPacket(closePacket);
            return;
        }
        if (this.connection.getState() === ConnectionState.Draining) {
            return;
        }
        this.connection.resetIdleAlarm();
        try {
            var receivedTime = Time.now(TimeFormat.MicroSeconds);
            var headerOffset: HeaderOffset = this.headerParser.parse(msg);
            this.headerHandler.handle(this.connection, headerOffset.header);
            var packetOffset: PacketOffset = this.packetParser.parse(this.connection, headerOffset, msg, EndpointType.Server);
            this.packetHandler.handle(this.connection, packetOffset.packet, receivedTime);
            this.connection.startIdleAlarm();
        }catch(err) {
            this.onError(this.connection, err);
            return;
        }
    }

    private onError(connection: Connection, error: any): any {
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
        connection.setState(ConnectionState.Closing);
        this.emit("error",error);
    }

    private onClose(): any {
        this.emit("close");
    }

}
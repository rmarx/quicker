import {PacketNumber, ConnectionID, Version} from '../types/header.properties';
import {PacketHandler} from '../packet/packet.handler';
import {Bignum} from '../types/bignum';
import {Stream, StreamType} from '../types/stream';
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
import { HttpHelper } from '../http/http0.9/http.helper';


export class Client extends EventEmitter{
        
    private port!: number;
    private hostname!: string;
    private options: any;

    private headerParser: HeaderParser;
    private packetParser: PacketParser;
    private headerHandler: HeaderHandler;
    private packetHandler: PacketHandler;
    private http09Helper: HttpHelper;

    private connection!: Connection;

    private bufferedRequests: string[];
    private isHandshakeCompleted: boolean;

    public constructor() {
        super();
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
        this.http09Helper = new HttpHelper();
        this.isHandshakeCompleted = false;
        this.bufferedRequests = [];
    }

    public connect(hostname: string, port: number, options?: any) {
        this.hostname = hostname;
        this.port = port;
        this.options = options;
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
        
        this.connection = new Connection(remoteInfo, EndpointType.Client, this.options);
        this.connection.setFirstConnectionID(ConnectionID.randomConnectionID());
        this.connection.setSocket(socket);
        this.setupConnectionEvents();
        
        socket.on('error',(err) => {this.onError(this.connection, err)});
        socket.on('message',(msg, rinfo) => {this.onMessage(msg, rinfo)});
        socket.on('close',() => {this.onClose()});
    }


    private setupConnectionEvents() {
        this.connection.on('con-close', () => {
            //process.exit(0);
        });
        this.connection.on('con-handshakedone', () => {
            this.bufferedRequests.forEach((val) => {
                this.sendRequest(val);
            });
        });
    }

    public request(request: string) {
        if (this.isHandshakeCompleted) {
            this.sendRequest(request);
        } else {
            this.bufferedRequests.push(request);
        }
    }

    private sendRequest(req: string) {
        var stream: Stream = this.connection.getNextStream(StreamType.ClientBidi);
        var buf = this.http09Helper.createRequest(req);
        var streamFrame = FrameFactory.createStreamFrame(stream,buf, true, true);
        this.connection.sendFrame(streamFrame);
    }

    public getPort(): number {
        return this.port;
    }
    
    public getHostname(): string {
        return this.hostname;
    }

    public getSession(): Buffer {
        return this.connection.getQuicTLS().getSession();
    }

    public setSession(buffer: Buffer) {
        this.connection.getQuicTLS().setSession(buffer);
    }

    public isSessionReused(): boolean {
        return this.connection.getQuicTLS().isSessionReused();
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
        connection.setState(ConnectionState.Closing);
        this.emit("error",error);
    }

    private onClose(): any {
        this.emit("close");
    }

}
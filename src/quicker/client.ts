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
import {ConnectionState, Connection,  RemoteInformation, ConnectionEvent} from '../types/connection';
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
import { QuicStream } from './quic.stream';
import { QuickerEvent } from './quicker.event';
import { TransportParameters } from '../crypto/transport.parameters';


export class Client extends EventEmitter{
        
    private port!: number;
    private hostname!: string;
    private options: any;

    private headerParser: HeaderParser;
    private packetParser: PacketParser;
    private headerHandler: HeaderHandler;
    private packetHandler: PacketHandler;

    private connection!: Connection;

    private bufferedRequests: BufferedRequest[];
    private connected: boolean;

    private constructor() {
        super();
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
        this.connected = false;
        this.bufferedRequests = [];
    }

    public static connect(hostname: string, port: number, options: any = {}, earlyDataRequest?: Buffer) {
        var client = new Client();
        client.hostname = hostname;
        client.port = port;
        // setting host to fill in SNI
        options.host = hostname;
        client.options = options;
        client.init();

        var packetNumber = PacketNumber.randomPacketNumber();
        client.connection.setLocalPacketNumber(packetNumber);
        var version = new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
        var stream = client.connection.getStream(new Bignum(0));
        var clientInitial: ClientInitialPacket = PacketFactory.createClientInitialPacket(client.connection);
        client.connection.sendPacket(clientInitial, false);
        client.connection.attemptEarlyData(earlyDataRequest);
        return client;
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
        
        socket.on(QuickerEvent.ERROR,(err) => {this.onError(this.connection, err)});
        socket.on(QuickerEvent.NEW_MESSAGE,(msg, rinfo) => {this.onMessage(msg, rinfo)});
    }


    private setupConnectionEvents() {
        this.connection.on(ConnectionEvent.DRAINING, () => {
            this.emit(QuickerEvent.CONNECTION_DRAINING, this.connection.getConnectionID().toString());
        });
        this.connection.on(ConnectionEvent.CLOSE, () => {
            this.emit(QuickerEvent.CONNECTION_CLOSE, this.connection.getConnectionID().toString());
        });
        this.connection.on(ConnectionEvent.HANDSHAKE_DONE, () => {
            this.bufferedRequests.forEach((val) => {
                this.sendRequest(val.stream, val.request);
            });
            this.connected = true;
            this.emit(QuickerEvent.CLIENT_CONNECTED);
        });
    }

    public request(request: Buffer): QuicStream {
        var stream: Stream = this.connection.getNextStream(StreamType.ClientBidi);
        if (this.connected) {
            this.sendRequest(stream, request);
        } else {
            this.bufferedRequests.push({
                request: request, 
                stream: stream
            });
        }
        return new QuicStream(this.connection, stream);
    }

    private sendRequest(stream: Stream, buf: Buffer) {
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

    public getTransportParameters(): Buffer {
        return this.connection.getRemoteTransportParameters().toBuffer();
    }

    public setSession(buffer: Buffer) {
        this.connection.getQuicTLS().setSession(buffer);
    }

    public setTransportParameters(tp: Buffer): void {
        return this.connection.setRemoteTransportParameters(TransportParameters.fromBuffer(this.connection, tp));
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
        this.emit(QuickerEvent.ERROR,error);
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
    }

}



interface BufferedRequest {
    request: Buffer, 
    stream: Stream
}
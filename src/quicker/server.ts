import {HandshakeState} from '../crypto/qtls';
import { TimeFormat, Time } from '../utilities/time';
import { HeaderParser, HeaderOffset } from '../packet/header/header.parser';
import { PacketParser, PacketOffset } from '../packet/packet.parser';
import { PacketHandler } from '../packet/packet.handler';
import { Connection, ConnectionState } from './../types/connection';
import { EndpointType } from './../types/endpoint.type';
import { BaseHeader, HeaderType } from '../packet/header/base.header';
import { ConnectionID, PacketNumber } from "./../types/header.properties";
import { ShortHeader } from '../packet/header/short.header';
import { LongHeader } from '../packet/header/long.header';
import { PacketFactory } from '../packet/packet.factory';
import { EventEmitter } from 'events';
import { Socket, RemoteInfo, createSocket, SocketType } from 'dgram';
import { readFileSync } from 'fs';
import { HeaderHandler } from './../packet/header/header.handler';
import { PacketLogging } from './../utilities/logging/packet.logging';
import { FrameFactory } from './../frame/frame.factory';
import { QuicError } from "./../utilities/errors/connection.error";
import { ConnectionCloseFrame } from '../frame/general/close';
import { ConnectionErrorCodes } from '../utilities/errors/connection.codes';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { SecureContext, createSecureContext } from 'tls';


export class Server extends EventEmitter {
    private server!: Socket;
    private port!: number;
    private host!: string;
    private options!: any;
    private secureContext?: SecureContext;

    private headerParser: HeaderParser;
    private headerHandler: HeaderHandler;
    private packetParser: PacketParser;
    private packetHandler: PacketHandler;

    private connections: { [key: string]: Connection; } = {};
    private omittedConnections: { [key: string]: Connection; } = {};

    private constructor() {
        super();
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
    }

    public static createServer(options?: any) {
        var server = new Server();
        server.options = options;
        if (options.host !== undefined) {
            server.host = options.host;
        }
        return server;
    }

    public listen(port: number, host: string = 'localhost') {
        this.host = host;
        this.port = port;

        this.init("udp4");
    }

    private init(socketType: SocketType) {
        this.server = createSocket(socketType);
        //this.server.on('error', (err) => { this.onError(err) });
        this.server.on('message', (msg, rinfo) => { this.onMessage(msg, rinfo) });
        this.server.on('close', () => { this.onClose() });
        this.server.bind(this.port, this.host);
    }

    private setupConnectionEvents(connection: Connection) {
        connection.on('con-close', () => {
            console.log("closed connection with id " + connection.getConnectionID());
            delete this.connections[connection.getConnectionID().toString()];
            this.emit('close');
        });

        connection.on('con-draining', () => {
            this.emit('draining');
        });
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        var receivedTime = Time.now(TimeFormat.MicroSeconds);
        var headerOffset: HeaderOffset = this.headerParser.parse(msg);
        var connection: Connection = this.getConnection(headerOffset, rinfo);
        if (connection.getState() === ConnectionState.Closing) {
            var closePacket = connection.getClosePacket();
            connection.sendPacket(closePacket);
        }
        if (connection.getState() === ConnectionState.Draining) {
            return;
        }
        connection.resetIdleAlarm();
        try {
            this.headerHandler.handle(connection, headerOffset.header);
            var packetOffset: PacketOffset = this.packetParser.parse(connection, headerOffset, msg, EndpointType.Client);
            this.packetHandler.handle(connection, packetOffset.packet, receivedTime);
            connection.startIdleAlarm();
        } catch (err) {
            if (err instanceof QuicError && err.getErrorCode() === ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR) {
                delete this.connections[connection.getConnectionID().toString()];
                var versionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connection);
                connection.sendPacket(versionNegotiationPacket);
                return;
            }else {
                this.onError(connection, err);
                return;
            }
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
        this.emit('error')
    }

    private onClose(): any {
        this.emit('close');
    }

    private getConnection(headerOffset: HeaderOffset, rinfo: RemoteInfo): Connection {
        var header: BaseHeader = headerOffset.header;
        var connectionID = header.getConnectionID();
        if (header.getHeaderType() === HeaderType.LongHeader) {
            if (this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
            }
        } else {
            var shortHeader = <ShortHeader>header;
            if (shortHeader.getConnectionIDOmitted()) {
                var connection = this.getConnectionByRemoteInformation(rinfo);
                if (connection !== undefined) {
                    return connection;
                }
            } else {
                if (connectionID !== undefined && this.connections[connectionID.toString()] !== undefined) {
                    return this.connections[connectionID.toString()];
                }
            }
        }
        var connection = this.createConnection(connectionID, rinfo);
        return connection;
    }

    private getConnectionByRemoteInformation(rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        var connection = this.omittedConnections[JSON.stringify(remoteInfo)];
        return connection;
    }

    private createConnection(connectionID: ConnectionID, rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        var connection = new Connection(remoteInfo, EndpointType.Server, this.options);
        connection.setSocket(this.server);
        connection.setFirstConnectionID(connectionID);
        var newConnectionID = ConnectionID.randomConnectionID();
        while (newConnectionID.toString() in Object.keys(this.connections)) {
            newConnectionID = ConnectionID.randomConnectionID();
        }
        connection.setConnectionID(newConnectionID);
        this.connections[connection.getConnectionID().toString()] = connection;
        this.setupConnectionEvents(connection);
        return connection;
    }

    private getSecureContext(key: Buffer, cert: Buffer): SecureContext {
        if (this.secureContext === undefined) {
            this.secureContext = createSecureContext({
                key: key,
                cert: cert
            });
        }
        return this.secureContext;
    }
}
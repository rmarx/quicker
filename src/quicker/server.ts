import { HandshakeState } from '../crypto/qtls';
import { TimeFormat, Time } from '../types/time';
import { HeaderParser, HeaderOffset } from '../utilities/parsers/header.parser';
import { PacketParser, PacketOffset } from '../utilities/parsers/packet.parser';
import { PacketHandler } from '../utilities/handlers/packet.handler';
import { Connection, ConnectionState, ConnectionEvent } from './connection';
import { EndpointType } from './../types/endpoint.type';
import { BaseHeader, HeaderType } from '../packet/header/base.header';
import { ConnectionID, PacketNumber } from "../packet/header/header.properties";
import { ShortHeader } from '../packet/header/short.header';
import { LongHeader } from '../packet/header/long.header';
import { PacketFactory } from '../utilities/factories/packet.factory';
import { EventEmitter } from 'events';
import { Socket, RemoteInfo, createSocket, SocketType } from 'dgram';
import { readFileSync } from 'fs';
import { HeaderHandler } from '../utilities/handlers/header.handler';
import { PacketLogging } from './../utilities/logging/packet.logging';
import { FrameFactory } from '../utilities/factories/frame.factory';
import { QuicError } from "./../utilities/errors/connection.error";
import { ConnectionCloseFrame } from '../frame/close';
import { ConnectionErrorCodes } from '../utilities/errors/connection.codes';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { SecureContext, createSecureContext } from 'tls';
import { QuicStream } from './quic.stream';
import { QuickerEvent } from './quicker.event';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';


export class Server extends EventEmitter {
    private serverSockets: { [key: string]: Socket; } = {};
    private port!: number;
    private host!: string;
    private options!: any;
    private secureContext?: SecureContext;

    private headerParser: HeaderParser;
    private headerHandler: HeaderHandler;
    private packetParser: PacketParser;
    private packetHandler: PacketHandler;

    private connections: { [key: string]: Connection; } = {};
    private mappedConnections: { [key: string]: string; } = {};
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
        // TODO: add check if options.key and options.cert are set
        if (options.secureContext === undefined) {
            options.secureContext = server.getSecureContext(options.key, options.cert);
        }
        server.options = options;
        return server;
    }

    public listen(port: number, host: string = 'localhost') {
        this.host = host;
        this.port = port;
        if (host !== undefined) {
            this.options.host = host;
        }

        this.init("udp4");
        this.init("udp6");
    }

    private init(socketType: SocketType) {
        var server = createSocket(socketType);
        server.on(QuickerEvent.NEW_MESSAGE, (msg, rinfo) => { this.onMessage(msg, rinfo) });
        server.on(QuickerEvent.CONNECTION_CLOSE, () => { this.onClose() });
        server.bind(this.port, this.host);
        if (socketType === "udp4") {
            this.serverSockets["IPv4"] = server;
        } else {
            this.serverSockets["IPv6"] = server;
        }
    }

    private setupConnectionEvents(connection: Connection) {
        connection.on(ConnectionEvent.STREAM, (quicStream: QuicStream) => {
            this.emit(QuickerEvent.NEW_STREAM, quicStream);
        });
        connection.on(ConnectionEvent.DRAINING, () => {
            this.emit(QuickerEvent.CONNECTION_DRAINING, connection.getConnectionID().toString());
        });
        connection.on(ConnectionEvent.CLOSE, () => {
            delete this.connections[connection.getConnectionID().toString()];
            this.emit(QuickerEvent.CONNECTION_CLOSE, connection.getConnectionID().toString());
        });
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        var receivedTime = Time.now();
        var headerOffset: HeaderOffset = this.headerParser.parse(msg);
        var connection: Connection = this.getConnection(headerOffset, rinfo);
        if (connection.getState() === ConnectionState.Closing) {
            var closePacket = connection.getClosePacket();
            connection.sendPacket(closePacket);
            return;
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
                this.deleteConnection(connection);
                var versionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connection);
                connection.sendPacket(versionNegotiationPacket);
                return;
            } else if (err instanceof QuickerError && err.getErrorCode() === QuickerErrorCodes.IGNORE_PACKET_ERROR) {
                return;
            } else {
                this.onError(connection, err);
                return;
            }
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
        this.emit(QuickerEvent.ERROR)
    }

    private onClose(): any {
        this.emit(QuickerEvent.CONNECTION_CLOSE);
    }

    /**
     * TODO: optimize, first connection takes 4.5ms
     * @param headerOffset 
     * @param rinfo 
     */
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
            } else if (connectionID !== undefined && this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
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
        connection.setSocket(this.serverSockets[rinfo.family]);
        connection.setFirstConnectionID(connectionID);
        var newConnectionID = ConnectionID.randomConnectionID();
        while (newConnectionID.toString() in Object.keys(this.connections)) {
            newConnectionID = ConnectionID.randomConnectionID();
        }
        connection.setConnectionID(newConnectionID);
        this.connections[connection.getConnectionID().toString()] = connection;
        this.mappedConnections[connection.getFirstConnectionID().toString()] = connection.getConnectionID().toString();
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

    private deleteConnection(connection: Connection) {
        var conId = connection.getConnectionID().toString();
        Object.keys(this.mappedConnections).forEach((key: string) => {
            if (key === conId) {
                delete this.mappedConnections[key];
            }
        });
        delete this.connections[conId];
    }
}
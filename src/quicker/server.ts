import { Connection, ConnectionEvent } from './connection';
import { QuickerEvent } from './quicker.event';
import { QuicStream } from './quic.stream';
import { Time } from '../types/time';
import { HeaderOffset } from '../utilities/parsers/header.parser';
import { PacketOffset } from '../utilities/parsers/packet.parser';
import { EndpointType } from '../types/endpoint.type';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { PacketFactory } from '../utilities/factories/packet.factory';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { BaseHeader, HeaderType } from '../packet/header/base.header';
import { ShortHeader } from '../packet/header/short.header';
import { ConnectionID } from '../packet/header/header.properties';
import { isIPv4, isIPv6 } from 'net';
import { Socket, RemoteInfo, createSocket, SocketType } from 'dgram';
import { SecureContext, createSecureContext } from 'tls';
import { Endpoint } from './endpoint';
import { ConnectionManager, ConnectionManagerEvents } from './connection.manager';
import { VerboseLogging } from '../utilities/logging/verbose.logging';

export class Server extends Endpoint {
    private serverSockets: { [key: string]: Socket; } = {};
    private connectionManager!: ConnectionManager;

    private constructor() {
        super();
    }

    public static createServer(options?: any) {
        var server = new Server();
        // TODO: add check if options.key and options.cert are set
        if (options.secureContext === undefined) {
            options.secureContext = server.createServerSecureContext(options.key, options.cert);
        }
        server.options = options;
        return server;
    }

    public listen(port: number, host: string = 'localhost') {
        this.hostname = host;
        this.port = port;
        if (host !== undefined) {
            this.options.host = host;
        }

        if (isIPv4(host)) {
            this.init("udp4");
        } else if (isIPv6(host)) {
            this.init("udp6");
        } else {
            this.init("udp4");
            this.init("udp6");
        }
        this.createConnectionManager();
    }

    private init(socketType: SocketType) {
        var server = createSocket(socketType);
        server.on(QuickerEvent.NEW_MESSAGE, (msg, rinfo) => { this.onMessage(msg, rinfo) });
        server.on(QuickerEvent.CONNECTION_CLOSE, () => { this.handleClose() });
        server.bind(this.port, this.hostname);
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
            this.emit(QuickerEvent.CONNECTION_DRAINING, connection.getSrcConnectionID().toString());
        });
        connection.on(ConnectionEvent.CLOSE, () => {
            this.connectionManager.deleteConnection(connection);
            this.emit(QuickerEvent.CONNECTION_CLOSE, connection.getSrcConnectionID().toString());
        });
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        try {
            var receivedTime = Time.now();
            var headerOffsets: HeaderOffset[] = this.headerParser.parse(msg);
        } catch (err) {
            return;
        }
        headerOffsets.forEach((headerOffset: HeaderOffset) => {
            var connection: Connection | undefined = undefined;
            try {
                connection = this.connectionManager.getConnection(headerOffset, rinfo);
                connection.checkConnectionState();
                connection.resetIdleAlarm();
                headerOffset = this.headerHandler.handle(connection, headerOffset, msg, EndpointType.Client);
                var packetOffset: PacketOffset = this.packetParser.parse(connection, headerOffset, msg, EndpointType.Client);
                this.packetHandler.handle(connection, packetOffset.packet, receivedTime);
                connection.startIdleAlarm();
            } catch (err) {
                if (connection === undefined) {
                    // Ignore when connection is undefined
                    // Only possible when a non-initial packet was received with a connection ID that is unknown to quicker
                    return;
                } else if (err instanceof QuicError && err.getErrorCode() === ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR) {
                    return;
                } else if (err instanceof QuickerError && err.getErrorCode() === QuickerErrorCodes.IGNORE_PACKET_ERROR) {
                    VerboseLogging.info("server:onMessage : caught IGNORE_PACKET_ERROR : " + err);
                    return;
                } else {
                    this.handleError(connection, err);
                    return;
                }
            }
        });
    }


    private createServerSecureContext(key: Buffer, cert: Buffer): SecureContext {
        var secureContext = createSecureContext({
            key: key,
            cert: cert
        });
        return secureContext;
    }

    private createConnectionManager() {
        this.connectionManager = new ConnectionManager(this.options.secureContext, this.serverSockets, this.options);
        this.connectionManager.on(ConnectionManagerEvents.CONNECTION_CREATED, (connection: Connection) => {
            this.setupConnectionEvents(connection);
        });
    }
}
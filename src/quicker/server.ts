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
import { ConnectionID, PacketNumber } from '../packet/header/header.properties';
import { isIPv4, isIPv6 } from 'net';
import { Socket, RemoteInfo, createSocket, SocketType } from 'dgram';
import { SecureContext, createSecureContext } from 'tls';
import { Endpoint } from './endpoint';
import { ConnectionManager, ConnectionManagerEvents } from './connection.manager';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { Bignum } from '../types/bignum';
import { EncryptionLevel, BufferedPacket } from '../crypto/crypto.context';
import { StreamType } from './stream'

export class Server extends Endpoint {
    private serverSockets: { [key: string]: Socket; } = {};
    private connectionManager!: ConnectionManager;

    private DEBUGmessageCounter:number = 0;

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
    
    public createStream(connection: Connection, streamType: StreamType.ServerBidi | StreamType.ServerUni): QuicStream {
        // TODO Check connection ownership
        return new QuicStream(connection, connection.getStreamManager().getNextStream(streamType));
    }

    private init(socketType: SocketType) {
        var server = createSocket(socketType);
        VerboseLogging.info("Server:init: Creating a socket of type " + socketType + " @ " + this.hostname);
        server.on(QuickerEvent.NEW_MESSAGE, (msg, rinfo) => { this.onMessage(msg, rinfo, undefined) });
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
        connection.on(ConnectionEvent.BufferedPacketReadyForDecryption, (packet:BufferedPacket) => {
            // TODO: now we're going to re-parse the entire packet, but we already parsed the header... see packet.offset
            // could be optimized so we don't re-parse the headers 
            this.onMessage( packet.packet, undefined, packet.connection );
        });
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo | undefined, receivingConnection: Connection | undefined): any {
        this.DEBUGmessageCounter++;
        let DEBUGmessageNumber = this.DEBUGmessageCounter; // prevent multiple incoming packets from overriding (shouldn't happen due to single threadedness, but I'm paranoid)
        
        VerboseLogging.debug("---------------------------------------------------////////////////////////////// Server: ON MESSAGE "+ DEBUGmessageNumber +" //////////////////////////////// " + msg.length);

        VerboseLogging.trace("server:onMessage: message length in bytes: " + msg.byteLength);
        VerboseLogging.trace("server:onMessage: raw message from the wire : " + msg.toString('hex'));
        
        let receivedTime = Time.now();
        let headerOffsets:HeaderOffset[]|undefined = undefined;

        try {
            headerOffsets = this.headerParser.parse(msg);
        } catch(err) {
            VerboseLogging.error("Server:onMessage: could not parse headers! Ignoring packet. " + JSON.stringify(rinfo) );
            // TODO: FIXME: properly propagate error? though, can't we just ignore this type of packet then? 
            return;
        }

        VerboseLogging.trace("Server:onMessage: Message contains " + headerOffsets.length + " independent packets (we think)");
        
        headerOffsets.forEach((headerOffset: HeaderOffset) => {
            let connection: Connection | undefined = undefined;
            try {
                if( receivingConnection )
                    connection = receivingConnection;
                else
                    connection = this.connectionManager.getConnection(headerOffset, rinfo!);

                connection.checkConnectionState();
                connection.resetIdleAlarm();

                let fullHeaderOffset:HeaderOffset|undefined = this.headerHandler.handle(connection, headerOffset, msg, EndpointType.Client);
                if( fullHeaderOffset ){
                    let packetOffset: PacketOffset = this.packetParser.parse(connection, fullHeaderOffset, msg, EndpointType.Client);
                    this.packetHandler.handle(connection, packetOffset.packet, receivedTime);
                }
                else
                    VerboseLogging.info("Server:handle: could not decrypt packet, buffering till later");

                connection.startIdleAlarm();
            } 
            catch (err) {
                if (connection === undefined) {
                    // Ignore when connection is undefined
                    // Only possible when a non-initial packet was received with a connection ID that is unknown to quicker
                    // TODO: handle this by buffering
                    VerboseLogging.error("server:onMessage : message received but ignored because we only expect an INITIAL packet at this point. TODO: buffer this until the initial is received, then re-process");
                    return;
                }
                else if (err instanceof QuicError && err.getErrorCode() === ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR) {
                    VerboseLogging.debug("server:onMessage : VERSION_NEGOTIATION_ERROR : unsupported version in INITIAL packet : " + err + " : re-negotiating");
                    connection = connection as Connection; // get rid of possible undefined, we check for that above
                    connection.resetConnectionState();
                    // we have received one initial, we need to keep packet numbers at 0, because next one will have pn 1 
                    connection.getEncryptionContext(EncryptionLevel.INITIAL)!.getPacketNumberSpace().setHighestReceivedNumber( new PacketNumber(new Bignum(0)) );

                    let versionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connection); 
                    connection.sendPacket(versionNegotiationPacket);
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
        
        VerboseLogging.trace("---------------------------------------------------////////////////////////////// Server: DONE WITH MESSAGE " + DEBUGmessageNumber + " //////////////////////////////// " + msg.length);
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
            this.emit(QuickerEvent.CONNECTION_CREATED, connection);
        });
    }

    // TODO: FIXME: remove this, should only be used for debugging! 
    public getConnectionManager(){
        return this.connectionManager;
    }
}
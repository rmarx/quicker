import { Connection, ConnectionEvent } from './connection';
import { QuickerEvent } from './quicker.event';
import { QuicStream } from './quic.stream';
import { Time } from '../types/time';
import { PartiallyParsedPacket } from '../utilities/parsers/header.parser';
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
import { BasePacket } from '../packet/base.packet';
import { StreamType } from './stream';

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
        connection.on(ConnectionEvent.BufferedPacketReadyForDecryption, (packet:BufferedPacket) => {
            // TODO: now we're going to re-parse the entire packet, but we already parsed the header... see packet.offset
            // could be optimized so we don't re-parse the headers 
            //this.onMessage( packet.packet.fullContents, undefined, packet.connection );
            VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// Server: PROCESSING BUFFERED PACKET //////////////////////////////// ");
            VerboseLogging.info("server:BufferedPacketReadyForDecryption: raw message from the wire : " + packet.packet.fullContents.toString('hex'));
            this.processPackets( [packet.packet], undefined, packet.connection, packet.receivedTime );
        });
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo | undefined): any {
        this.DEBUGmessageCounter++;
        
        VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// Server: ON MESSAGE "+ this.DEBUGmessageCounter +" //////////////////////////////// " + msg.length);

        VerboseLogging.trace("server:onMessage: message length in bytes: " + msg.byteLength);
        VerboseLogging.info("server:onMessage: raw message from the wire : " + msg.toString('hex'));
        
        let receivedTime = Time.now();
        let packets:PartiallyParsedPacket[]|undefined = undefined;


        // Packets are encrypted twice before sending:
        // 1. The payload was encrypted first, using the unencrypted header as Associated Data
        // 2. Parts of the header were encrypted (PacketNumber and a few bits in the first byte)

        // We first need to undo the 2nd step, but to do that, we need to sample a part of the encrypted payload (as the encrypted payload is used as Associated Data for the header encryption)
        // To know which part we need to sample, we need to calculate a sample offset (see aead:getHeaderProtectionSampleOffset)
        // To calculate this offset, we need to know how long the header is (not always the same size, as the connection IDs can differ in length)

        // So, we approach this in three steps: 
        // a. we will parse the unencrypted parts of the header we need to calculate the sample offset : we call this a shallow parse : HeaderParser:parseShallowHeader
            // note: we also need to do this to know to which connection a packet belongs before we can look up that connection's decryption keys 
        // b. we will decrypt the header and parse the now unprotected parts : HeaderHandler:decryptHeader
        // c. we will handle the header semantics : HeaderHandler:handle

        // TODO: this could be easier if we just did everything in a single function/place, but that's a bigger refactor than I'm willing to commit to right now

        try {
            packets = this.headerParser.parseShallowHeader(msg);
        } 
        catch(err) {
            VerboseLogging.error("Server:onMessage: could not parse headers! Ignoring packet. " + err.toString()  + " // " + JSON.stringify(rinfo) + " -> " + msg.toString('hex') );
            // TODO: FIXME: properly propagate error? though, can't we just ignore this type of packet then? 
            return;
        }

        VerboseLogging.debug("Server:onMessage: Message contains " + packets.length + " independent packets (we think)");

        this.processPackets( packets!, rinfo, undefined, receivedTime );
    }

    private processPackets( packets: PartiallyParsedPacket[], rinfo: RemoteInfo | undefined, receivingConnection: Connection | undefined, receivedTime: Time ){

        packets.forEach((packet: PartiallyParsedPacket) => {
            let connection: Connection | undefined = undefined;
            try {
                if( receivingConnection )
                    connection = receivingConnection;
                else
                    connection = this.connectionManager.getConnection(packet.header, rinfo!);

                connection.checkConnectionState();
                connection.resetIdleAlarm();

                let decryptedHeaderPacket:PartiallyParsedPacket|undefined = this.headerHandler.decryptHeader(connection, packet, EndpointType.Client, receivedTime);

                if( decryptedHeaderPacket !== undefined ){
                    let handledHeader:PartiallyParsedPacket|undefined = this.headerHandler.handle(connection, decryptedHeaderPacket, EndpointType.Client);
                    let fullyDecryptedPacket: BasePacket = this.packetParser.parse(connection, handledHeader!, EndpointType.Client);

                    // if we call .handle() directly here, we can end up delaying packets being put on the wire
                    // This is because NodeJS is single-threaded and uses an event-loop system. In this loop, data is put on the wire AFTER received data is processed
                    // In our case, if we recieve many packets at once, that also take a long time to handle, each packet can generate new ones, but those are only actually sent out
                    // when ALL of the incoming packets have been fully handled...
                    // setImmediate() schedules the .handle() for the next iteration of the event loop, somewhat combatting this problem in practice
                    // see also: https://rclayton.silvrback.com/scheduling-execution-in-node-js
                    setImmediate( () => {
                        VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// Server: handling packet  //////////////////////////////// ");
                        this.packetHandler.handle(connection!, fullyDecryptedPacket, receivedTime);
                        VerboseLogging.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<////////////////////////////// Server: done handling packet //////////////////////////////// ");
                    });
                }
                else
                    VerboseLogging.info("Server:processPackets: could not decrypt packet, buffering till later");

                connection.startIdleAlarm();
            } 
            catch (err) {
                if (connection === undefined) {
                    // Ignore when connection is undefined
                    // Only possible when a non-initial packet was received with a connection ID that is unknown to quicker
                    // TODO: handle this by buffering
                    VerboseLogging.error("Server:processPackets : message received but ignored because we only expect an INITIAL packet at this point. TODO: buffer this until the initial is received, then re-process");
                    return;
                }
                else if (err instanceof QuicError && err.getErrorCode() === ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR) {
                    VerboseLogging.debug("Server:processPackets : VERSION_NEGOTIATION_ERROR : unsupported version in INITIAL packet : " + err + " : re-negotiating");
                    connection = connection as Connection; // get rid of possible undefined, we check for that above
                    connection.resetConnectionState();
                    // we have received one initial, we need to keep packet numbers at 0, because next one will have pn 1 
                    connection.getEncryptionContext(EncryptionLevel.INITIAL)!.getPacketNumberSpace().setHighestReceivedNumber( new PacketNumber(new Bignum(0)) );

                    let versionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connection); 
                    connection.sendPacket(versionNegotiationPacket);
                    return;
                } else if (err instanceof QuickerError && err.getErrorCode() === QuickerErrorCodes.IGNORE_PACKET_ERROR) {
                    VerboseLogging.info("Server:processPackets : caught IGNORE_PACKET_ERROR : " + err);
                    return;
                } else {
                    this.handleError(connection, err);
                    return;
                }
            }
        });

        VerboseLogging.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<////////////////////////////// Server: done processing these packets //////////////////////////////// ");
    }

    public closeConnection(connection:Connection, error:QuicError){
        try{
            this.handleError(connection, error);
        }
        catch(e){

        }
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
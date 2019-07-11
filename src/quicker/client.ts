import { Connection, RemoteInformation, ConnectionEvent } from './connection';
import { PacketNumber, Version, ConnectionID } from '../packet/header/header.properties';
import { Constants } from '../utilities/constants';
import { Bignum } from '../types/bignum';
import { EndpointType } from '../types/endpoint.type';
import { QuickerEvent } from './quicker.event';
import { QuicStream } from './quic.stream';
import { Stream, StreamType } from './stream';
import { TransportParameters } from '../crypto/transport.parameters';
import { Time } from '../types/time';
import { PartiallyParsedPacket } from '../utilities/parsers/header.parser';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { isIPv6 } from 'net';
import { Socket, createSocket, RemoteInfo } from 'dgram';
import { Endpoint } from './endpoint';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { QuicError } from '../utilities/errors/connection.error';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { BufferedPacket } from '../crypto/crypto.context';
import { BasePacket } from '../packet/base.packet';

export class Client extends Endpoint {

    private connection!: Connection;

    private bufferedRequests: BufferedRequest[];
    private connected: boolean;

    private DEBUGmessageCounter:number = 0;

    private constructor() {
        super();
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
        client.init(() => {
            client.connection.startConnection();
            client.connection.attemptEarlyData(earlyDataRequest);
        });

        return client;
    }

    private init(onSocketReady:() => void): void {

        let onSocketBound = () => {
            var remoteInfo: RemoteInformation = {
                address: this.hostname,
                port: this.port,
                family: family
            };
    
            this.connection = new Connection(remoteInfo, EndpointType.Client, socket, ConnectionID.randomConnectionID(), this.options);
            this.connection.setSrcConnectionID(ConnectionID.randomConnectionID());
            this.setupConnectionEvents();
    
            socket.on(QuickerEvent.ERROR, (err) => { this.handleError(this.connection, err) });
            socket.on(QuickerEvent.NEW_MESSAGE, (msg, rinfo) => { this.onMessage(msg) });

            onSocketReady();
        }

        var family = 'IPv4';
        if (isIPv6(this.hostname)) {
            var socket = createSocket("udp6");
            family = 'IPv6';
        } else {
            var socket = createSocket("udp4");
        }

        // TODO: allow top-level user to specify an address and port to bind client socket on 
        // look at how Node's HTTP client typically does this 
        socket.bind(undefined, undefined, onSocketBound);
    }


    private setupConnectionEvents() {
        this.connection.on(ConnectionEvent.STREAM, (quicStream: QuicStream) => {
            this.emit(QuickerEvent.NEW_STREAM, quicStream);
        });
        this.connection.on(ConnectionEvent.CREATED_STREAM, (quicStream: QuicStream) => {
            this.emit(QuickerEvent.CREATED_STREAM, quicStream);
        });
        this.connection.on(ConnectionEvent.DRAINING, () => {
            var connectionID = this.connection.getSrcConnectionID();
            this.emit(QuickerEvent.CONNECTION_DRAINING, connectionID.toString());
        });
        this.connection.on(ConnectionEvent.CLOSE, () => {
            var connectionID = this.connection.getSrcConnectionID();
            this.emit(QuickerEvent.CONNECTION_CLOSE, connectionID.toString());
        });
        this.connection.on(ConnectionEvent.HANDSHAKE_DONE, () => {
            this.connected = true;
            this.bufferedRequests.forEach((val) => {
                this.sendRequest(val.stream, val.request);
            });
            this.bufferedRequests = [];
            this.emit(QuickerEvent.CLIENT_CONNECTED);
        });
        this.connection.on(ConnectionEvent.BufferedPacketReadyForDecryption, (packet:BufferedPacket) => {
            // TODO: now we're going to re-parse the entire packet, but we already parsed the header... see packet.offset
            // could be optimized so we don't re-parse the headers
            VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// Client: PROCESSING BUFFERED PACKET //////////////////////////////// ");
            VerboseLogging.info("client:BufferedPacketReadyForDecryption: raw message from the wire : " + packet.packet.fullContents.toString('hex'));
            this.processPackets( [packet.packet], packet.receivedTime );
        });
    }

    public request(request: Buffer, streamType: StreamType.ClientBidi | StreamType.ClientUni): QuicStream {
        var stream: Stream = this.connection.getStreamManager().getNextStream(streamType);
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
    
    public createStream(streamType: StreamType.ClientBidi | StreamType.ClientUni): QuicStream {
        // TODO Check connection ownership
        if (this.connected) {
            return new QuicStream(this.connection, this.connection.getStreamManager().getNextStream(streamType));   
        } else {
            throw new QuickerError(QuickerErrorCodes.NO_CONNECTION);
        }
    }

    private sendRequest(stream: Stream, buf: Buffer) {
        stream.addData(buf, true);
        this.connection.sendPackets();
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

    public isSessionReused(): boolean {
        return this.connection.getQuicTLS().isSessionReused();
    }

    public close(closePhrase:string|undefined = undefined) {
        // TODO: close connection with applicationcloseframe
        this.handleError( this.connection, new QuicError(ConnectionErrorCodes.NO_ERROR, ( closePhrase !== undefined ? closePhrase : "Everything is well in the world") ));
    }

    // TODO: FIXME: remove! this is for debugging only!
    public getConnection(): Connection{
        return this.connection;
    }

    /**
     * 
     * @param msg The buffer containing one full UDP datagram (can consist of multiple compound QUIC-level packets)
     */
    private onMessage(msg: Buffer): any {
        this.DEBUGmessageCounter++;
        let DEBUGmessageNumber = this.DEBUGmessageCounter; // prevent multiple incoming packets from overriding (shouldn't happen due to single threadedness, but I'm paranoid)
        
        VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// CLIENT ON MESSAGE "+ DEBUGmessageNumber +" ////////////////////////////////" + msg.length);
            
        VerboseLogging.trace("client:onMessage: message length in bytes: " + msg.byteLength);
        VerboseLogging.info("client:onMessage: raw message from the wire : " + msg.toString('hex'));
        
        let receivedTime = Time.now();
        let packets:PartiallyParsedPacket[]|undefined = undefined;

        try {
            packets = this.headerParser.parseShallowHeader(msg);
        } 
        catch(err) {
            VerboseLogging.error("Client:onMessage: could not parse headers! Ignoring packet. " + err.toString() + " -> " + msg.toString('hex') );
            // TODO: FIXME: properly propagate error? though, can't we just ignore this type of packet then? 
            return;
        }

        VerboseLogging.debug("Client:onMessage: Message contains " + packets.length + " independent packets (we think)");

        this.processPackets( packets!, receivedTime );
    }

    private processPackets( packets: PartiallyParsedPacket[], receivedTime: Time ){

        try {
            this.connection.checkConnectionState(); 
            this.connection.resetIdleAlarm();

            packets.forEach((packet: PartiallyParsedPacket) => {
                let decryptedHeaderPacket:PartiallyParsedPacket|undefined = this.headerHandler.decryptHeader(this.connection, packet, EndpointType.Server, receivedTime);

                if( decryptedHeaderPacket !== undefined ){

                    let handledHeader:PartiallyParsedPacket|undefined = this.headerHandler.handle(this.connection, decryptedHeaderPacket, EndpointType.Server);
                    let fullyDecryptedPacket: BasePacket = this.packetParser.parse(this.connection, handledHeader!, EndpointType.Server);

                    setImmediate( () => { 
                        VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// Client: handling packet  //////////////////////////////// ");
                        this.packetHandler.handle(this.connection, fullyDecryptedPacket, receivedTime); 
                        VerboseLogging.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<////////////////////////////// Client: done handling packet //////////////////////////////// ");
                    });
                }
                else
                    VerboseLogging.info("Client:processPackets: could not decrypt packet, buffering till later");
            });

            this.connection.startIdleAlarm();
        } 
        catch (err) {
            if (err instanceof QuickerError && err.getErrorCode() === QuickerErrorCodes.IGNORE_PACKET_ERROR) {
                VerboseLogging.info("Client:processPackets : caught IGNORE_PACKET_ERROR : " + err);
                return;
            }
            if (err instanceof QuicError && err.getErrorCode() === ConnectionErrorCodes.VERSION_NEGOTIATION_ERROR) {
                this.emit(QuickerEvent.ERROR, err);
                return;
            }

            this.handleError(this.connection, err);
            return;
        }

        VerboseLogging.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<////////////////////////////// Client: done processing these packets //////////////////////////////// ");
    }

}

interface BufferedRequest {
    request: Buffer,
    stream: Stream
}

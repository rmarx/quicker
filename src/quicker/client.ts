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
import { HeaderOffset } from '../utilities/parsers/header.parser';
import { PacketOffset } from '../utilities/parsers/packet.parser';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { isIPv6 } from 'net';
import { Socket, createSocket, RemoteInfo } from 'dgram';
import { Endpoint } from './endpoint';

export class Client extends Endpoint {

    private connection!: Connection;

    private bufferedRequests: BufferedRequest[];
    private connected: boolean;

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
        client.init();

        var packetNumber = PacketNumber.randomPacketNumber();
        client.connection.setLocalPacketNumber(packetNumber);
        var version = new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
        var stream = client.connection.getStreamManager().getStream(new Bignum(0));
        client.connection.startConnection();
        client.connection.attemptEarlyData(earlyDataRequest);
        return client;
    }

    private init(): void {
        var family = 'IPv4';
        if (isIPv6(this.hostname)) {
            var socket = createSocket("udp6");
            family = 'IPv6';
        } else {
            var socket = createSocket("udp4");
        }
        var remoteInfo: RemoteInformation = {
            address: this.hostname,
            port: this.port,
            family: family
        };

        this.connection = new Connection(remoteInfo, EndpointType.Client, socket, this.options);
        this.connection.setSrcConnectionID(ConnectionID.randomConnectionID());
        this.connection.setInitialDestConnectionID(ConnectionID.randomConnectionID());
        this.setupConnectionEvents();

        socket.on(QuickerEvent.ERROR, (err) => { this.handleError(this.connection, err) });
        socket.on(QuickerEvent.NEW_MESSAGE, (msg, rinfo) => { this.onMessage(msg, rinfo) });
    }


    private setupConnectionEvents() {
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
    }

    public request(request: Buffer): QuicStream {
        var stream: Stream = this.connection.getStreamManager().getNextStream(StreamType.ClientBidi);
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

    public setTransportParameters(tp: Buffer): void {
        return this.connection.setRemoteTransportParameters(TransportParameters.fromBuffer(false, tp));
    }

    public isSessionReused(): boolean {
        return this.connection.getQuicTLS().isSessionReused();
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        try {
            this.connection.checkConnectionState();
            this.connection.resetIdleAlarm();
            var receivedTime = Time.now();
            var headerOffsets: HeaderOffset[] = this.headerParser.parse(msg);
            headerOffsets.forEach((headerOffset: HeaderOffset) => {
                headerOffset = this.headerHandler.handle(this.connection, headerOffset);
                var packetOffset: PacketOffset = this.packetParser.parse(this.connection, headerOffset, msg, EndpointType.Server);
                this.packetHandler.handle(this.connection, packetOffset.packet, receivedTime);
            });
            this.connection.startIdleAlarm();
        } catch (err) {
            if (err instanceof QuickerError && err.getErrorCode() === QuickerErrorCodes.IGNORE_PACKET_ERROR) {
                return;
            }
            this.handleError(this.connection, err);
            return;
        }
    }

}

interface BufferedRequest {
    request: Buffer,
    stream: Stream
}

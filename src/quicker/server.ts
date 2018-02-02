import { TimeFormat, Time } from '../utilities/time';
import { HeaderParser, HeaderOffset } from '../packet/header/header.parser';
import { PacketParser, PacketOffset } from '../packet/packet.parser';
import { PacketHandler } from '../packet/packet.handler';
import { Connection } from './../types/connection';
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


export class Server extends EventEmitter {
    private server: Socket;
    private port: number;
    private host: string;

    private headerParser: HeaderParser;
    private headerHandler: HeaderHandler;
    private packetParser: PacketParser;
    private packetHandler: PacketHandler;

    private connections: { [key: string]: Connection; } = {};
    private omittedConnections: { [key: string]: Connection; } = {};

    public constructor() {
        super();
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
    }

    public listen(host: string, port: number) {
        this.host = host;
        this.port = port;

        this.init("udp4");
    }

    private init(socketType: SocketType) {
        this.server = createSocket(socketType);
        this.server.on('error', (err) => { this.onError(err) });
        this.server.on('message', (msg, rinfo) => { this.onMessage(msg, rinfo) });
        this.server.on('listening', () => { this.onListening() });
        this.server.on('close', () => { this.onClose() });
        this.server.bind(this.port, this.host);
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        var receivedTime = Time.now(TimeFormat.MicroSeconds);
        var headerOffset: HeaderOffset = this.headerParser.parse(msg);
        var connection: Connection = this.getConnection(headerOffset, rinfo);
        try {
            this.headerHandler.handle(connection, headerOffset.header);
            var packetOffset: PacketOffset = this.packetParser.parse(connection, headerOffset, msg, EndpointType.Client);
            this.packetHandler.handle(connection, packetOffset.packet, receivedTime);
        } catch (err) {
            if (err.message === "UNKNOWN_VERSION") {
                delete this.connections[connection.getConnectionID().toString()];
                var versionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connection);
                connection.sendPacket(versionNegotiationPacket);
                return;
            } else if (err.message === "REMOVE_CONNECTION") {
                delete this.connections[connection.getConnectionID().toString()];
            }else {
                this.onError(err);
                return;
            }
        }
    }

    private onError(error: Error): any {
        console.log("Error: " + error.message);
        console.log("Stack: " + error.stack);
    }

    private onClose(): any {
        console.log("close");
    }

    private onListening(): any {
        console.log("listening");
    }

    private getConnection(headerOffset: HeaderOffset, rinfo: RemoteInfo): Connection {
        var header: BaseHeader = headerOffset.header;
        var connectionID = header.getConnectionID();
        if (connectionID === undefined) {
            throw Error("No connectionID supplied");
        }
        if (header.getHeaderType() === HeaderType.LongHeader) {
            if (connectionID !== undefined && this.connections[connectionID.toString()] !== undefined) {
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
        var connection = new Connection(remoteInfo, EndpointType.Server, { key: readFileSync('../keys/key.pem'), cert: readFileSync('../keys/cert.pem') });
        connection.setSocket(this.server);
        connection.setFirstConnectionID(connectionID);
        var newConnectionID = ConnectionID.randomConnectionID();
        while (newConnectionID.toString() in Object.keys(this.connections)) {
            newConnectionID = ConnectionID.randomConnectionID();
        }
        connection.setConnectionID(newConnectionID);
        this.connections[connection.getConnectionID().toString()] = connection;
        return connection;
    }
}
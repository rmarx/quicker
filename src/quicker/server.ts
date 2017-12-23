import {PacketHandler} from '../packet/packet.handler';
import {Connection} from './connection';
import { Socket, createSocket, SocketType, RemoteInfo } from "dgram";
import { PacketParser, PacketOffset } from "../packet/packet.parser";
import { BasePacket } from "../packet/base.packet";
import { EventEmitter } from "events";
import { VersionNegotiationPacket } from "../packet/packet/version.negotiation";
import { Constants } from "../utilities/constants";
import { Version, LongHeader } from "../packet/header/long.header";
import { PacketFactory } from "../packet/packet.factory";
import { PacketNumber, BaseHeader, HeaderType } from "../packet/header/base.header";
import { HeaderParser } from "../packet/header/header.parser";
import { EndpointType } from "./type";
import { readFileSync } from "fs";

export class Server extends EventEmitter{
    private server: Socket;
    private port: number;
    private host: string;

    private packetParser: PacketParser;
    private packetHandler: PacketHandler;

    private connections: { [key: string]: Connection; } = { }

    public constructor() {
        super();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
    }

    public listen(host: string, port: number) {
        this.host = host;
        this.port = port;
        /**
         * TODO: Check if host is ipv6 or ipv4
         */
        this.server = createSocket('udp4');
        this.server.on('error',(err) => {this.onError(err)});
        this.server.on('message',(msg, rinfo) => {this.onMessage(msg, rinfo)});
        this.server.on('listening',() => {this.onListening()});
        this.server.on('close',() => {this.onClose()});
        this.server.bind(this.port, this.host);
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {
        var connection = this.getConnection(rinfo);
        console.log("on message");
        try {
            var packetOffset: PacketOffset = this.packetParser.parse(msg, EndpointType.Client, connection);
            this.packetHandler.handle(connection, packetOffset.packet);
            
        }catch(err) {
            // packet not parseable yet.
            console.log("Error: " + err.message);
            console.log("Stack: " + err.stack);
            return;
        }
    }

    private onError(error: Error): any {
        console.log("error: " + error.message);
    }

    private onClose(): any {
        console.log("close");
    }

    private onListening(): any {
        console.log("listening");
    }

    private getConnection(rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        var connection = this.connections[JSON.stringify(remoteInfo)];
        if (connection === undefined) {
            connection = new Connection(remoteInfo, EndpointType.Server, {key: readFileSync('../keys/key.pem'), cert: readFileSync('../keys/cert.pem')});
            connection.setSocket(this.server);
            this.connections[JSON.stringify(remoteInfo)] = connection;
        }
        return connection;
    }

    private sendVersionNegotiationPacket(connection: Connection, header: LongHeader) {
        var connectionID = header.getConnectionID();
        if (connectionID !== undefined) {
            var packetNumber = PacketNumber.randomPacketNumber();
            var versionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connection, packetNumber);
            this.server.send(versionNegotiationPacket.toBuffer(connection),connection.getRemoteInfo().port, connection.getRemoteInfo().address);
        }
    }
}
import { Socket, createSocket, SocketType, RemoteInfo } from "dgram";
import { PacketParser, PacketOffset } from "../packet/packet.parser";
import { BasePacket } from "../packet/base.packet";
import { EventEmitter } from "events";
import { VersionNegotiationPacket } from "../packet/packet/version.negotiation";
import { Constants } from "../utilities/constants";
import { Version } from "../packet/header/long.header";
import { PacketFactory } from "../packet/packet.factory";
import { PacketNumber } from "../packet/header/base.header";

export class Server extends EventEmitter{
    private server: Socket;
    private port: number;
    private host: string;

    private packetParser: PacketParser;

    public constructor() {
        super();
        this.packetParser = new PacketParser();
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
        console.log("on message");
        try {
            var packetOffset: PacketOffset = this.packetParser.parse(msg);
        }catch(err) {
            // packet not parseable yet.
            console.log("parse error: " + err.message);
            return;
        }
        var packet: BasePacket = packetOffset.packet;
        // TODO parse frames
        console.log("Packet type: " + packet.getPacketType().toString());
        console.log("Packet number: " + packet.getHeader().getPacketNumber().toString());
        // TODO ACK 
        var connectionID = packet.getHeader().getConnectionID();
        var packetNumber = PacketNumber.randomPacketNumber();
        if(connectionID !== undefined) {
            console.log("Connection ID: " + connectionID.toString());
            var version = new Version(Buffer.from(Constants.getActiveVersion(),'hex'));
            var p = PacketFactory.createVersionNegotiationPacket(connectionID, packetNumber, version);
            this.server.send(p.toBuffer(),rinfo.port, rinfo.address);
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
}
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
            var header = (new HeaderParser()).parse(msg).header;
            if (header.getHeaderType() === HeaderType.LongHeader) {
                var longHeader: LongHeader = <LongHeader>header;
                this.sendVersionNegotiationPacket(rinfo, longHeader);
            }
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

    private sendVersionNegotiationPacket(rinfo: RemoteInfo, header: LongHeader) {
        var connectionID = header.getConnectionID();
        if (connectionID !== undefined) {
            var packetNumber = PacketNumber.randomPacketNumber();
            var version = header.getVersion();
            var p = PacketFactory.createVersionNegotiationPacket(connectionID, packetNumber, version);
            this.server.send(p.toBuffer(),rinfo.port, rinfo.address);
        }
    }
}
import { Socket, createSocket, RemoteInfo, SocketOptions } from "dgram";
import { PacketParser, PacketOffset } from "../packet/packet.parser";
import { BasePacket } from "../packet/base.packet";
import { VersionNegotiationPacket } from "../packet/packet/version.negotiation";
import { ConnectionID, PacketNumber } from "../packet/header/base.header";
import { Version } from "../packet/header/long.header";
import { Constants } from "../utilities/constants";
import { PacketFactory } from "../packet/packet.factory";

export class Client {
        
    private port: number;
    private hostname: string;
    private client: Socket;

    private packetParser: PacketParser;

    constructor() {
        this.packetParser = new PacketParser();
    }

    public connect(hostname: string, port: number) {
        this.hostname = hostname;
        this.port = port;
        this.client = createSocket("udp4");
        this.client.on('error',(err) => {this.onError(err)});
        this.client.on('message',(msg, rinfo) => {this.onMessage(msg, rinfo)});
        this.client.on('close',() => {this.onClose()});
    }

    public testSend() {;
        var connectionID = ConnectionID.randomConnectionID();
        var packetNumber = PacketNumber.randomPacketNumber();
        var version = new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
        var versionNegotiationPacket: VersionNegotiationPacket = PacketFactory.createVersionNegotiationPacket(connectionID, packetNumber, version);
        this.client.send(versionNegotiationPacket.toBuffer(), this.port, this.hostname);
    }

    public getPort(): number {
        return this.port;
    }
    
    public getHostname(): string {
        return this.hostname;
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
            this.client.send(p.toBuffer(),rinfo.port, rinfo.address);
        }
    }

    private onError(error: Error): any {
        console.log("error");
    }

    private onClose(): any {
        console.log("close");
    }

}
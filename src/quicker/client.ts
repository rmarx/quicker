import { Socket, createSocket, RemoteInfo } from "dgram";
import { PacketParser, PacketOffset } from "../packet/packet.parser";
import { BasePacket } from "../packet/base.packet";
import { VersionNegotiationPacket } from "../packet/packet/version.negotiation";
import { ConnectionID, PacketNumber } from "../packet/header/base.header";
import { Version } from "../packet/header/long.header";
import { Constants } from "../helpers/constants";

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
        this.client.on('error',this.onError);
        this.client.on('message',this.onMessage);
        this.client.on('close',this.onClose);
    }

    public testSend() {
        var conBuf = Buffer.from("ffffffffffffffff", 'hex');
        console.log("conbuf: " + conBuf.byteLength);
        var connectionID = new ConnectionID(conBuf);
        var packetNumber = new PacketNumber(Buffer.from("ffffffff", 'hex'), 4);
        var version = new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
        var versionNegotiationPacket: VersionNegotiationPacket = VersionNegotiationPacket.createVersionNegotiationPacket(connectionID, packetNumber, version);
        this.client.send(versionNegotiationPacket.toBuffer(), this.port, this.hostname);
    }

    public getPort(): number {
        return this.port;
    }
    
    public getHostname(): string {
        return this.hostname;
    }

    private onMessage(msg: Buffer, rinfo: RemoteInfo): any {

        try {
            var packetOffset: PacketOffset = this.packetParser.parse(msg);
        }catch(err) {
            // packet not parseable yet.
            return;
        }
        var packet: BasePacket = packetOffset.packet;
        // TODO parse frames
        console.log("Packet type: " + packet.getPacketType().toString());
        // TODO ACK 
    }

    private onError(error: Error): any {
        console.log("error");
    }

    private onClose(): any {
        console.log("close");
    }

}
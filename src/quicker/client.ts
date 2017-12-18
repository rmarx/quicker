import {Constants} from '../utilities/constants';
import {Version} from '../packet/header/long.header';
import {ClientInitialPacket} from '../packet/packet/client.initial';
import {PacketParser, PacketOffset} from '../packet/packet.parser';
import {PacketFactory} from '../packet/packet.factory';
import {QTLS} from '../crypto/qtls';
import {ConnectionID, PacketNumber} from '../packet/header/base.header';
import {VersionNegotiationPacket} from '../packet/packet/version.negotiation';
import {BasePacket} from '../packet/base.packet';
import { Socket, createSocket, RemoteInfo } from 'dgram';
import * as fs from 'fs';


export class Client {
        
    private port: number;
    private hostname: string;
    private client: Socket;

    private packetParser: PacketParser;
    private qtls: QTLS;

    constructor() {
        this.packetParser = new PacketParser();
        this.qtls = new QTLS(false, {key: fs.readFileSync('./../keys/key.pem'), cert: fs.readFileSync('./../keys/cert.pem')});
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
        console.log("connectionid: " + connectionID.toString());
        console.log("packet number: " + packetNumber.toString());
        var clientInitial: ClientInitialPacket = PacketFactory.createClientInitialPacket(connectionID, packetNumber, version, this.qtls);
        this.client.send(clientInitial.toBuffer(), this.port, this.hostname);
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
        console.log("Packet number: " + packet.getHeader().getPacketNumber().toString());
        // TODO ACK 
        var connectionID = packet.getHeader().getConnectionID();
        var packetNumber = PacketNumber.randomPacketNumber();
        if(connectionID !== undefined) {
            console.log("Connection ID: " + connectionID.toString());
            var p = PacketFactory.createVersionNegotiationPacket(connectionID, packetNumber);
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
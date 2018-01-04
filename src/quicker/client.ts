import {PacketNumber, ConnectionID, Version} from '../types/header.properties';
import {PacketHandler} from '../packet/packet.handler';
import {Bignum} from '../types/bignum';
import {Stream} from '../types/stream';
import {Constants} from '../utilities/constants';
import {ClientInitialPacket} from '../packet/packet/client.initial';
import {PacketParser, PacketOffset} from '../packet/packet.parser';
import {PacketFactory} from '../packet/packet.factory';
import {QTLS} from '../crypto/qtls';
import {VersionNegotiationPacket} from '../packet/packet/version.negotiation';
import {BasePacket} from '../packet/base.packet';
import { Socket, createSocket, RemoteInfo } from 'dgram';
import * as fs from 'fs';
import {EndpointType} from '../types/endpoint.type';
import {Connection, RemoteInformation} from '../types/connection';
import { HeaderOffset, HeaderParser } from './../packet/header/header.parser';
import { HeaderHandler } from './../packet/header/header.handler';
import { Time, TimeFormat } from '../utilities/time';


export class Client {
        
    private port: number;
    private hostname: string;

    private headerParser: HeaderParser;
    private packetParser: PacketParser;
    private headerHandler: HeaderHandler;
    private packetHandler: PacketHandler;

    private connection: Connection;

    public constructor() {
        this.headerParser = new HeaderParser();
        this.headerHandler = new HeaderHandler();
        this.packetParser = new PacketParser();
        this.packetHandler = new PacketHandler();
    }

    public connect(hostname: string, port: number) {
        this.hostname = hostname;
        this.port = port;
        var socket = createSocket("udp4");
        socket.on('error',(err) => {this.onError(err)});
        socket.on('message',(msg, rinfo) => {this.onMessage(msg, rinfo)});
        socket.on('close',() => {this.onClose()});
        var remoteInfo: RemoteInformation = {
            address: hostname,
            port: port, 
            family: 'IPv4'
        };
        this.connection = new Connection(remoteInfo, EndpointType.Client);
        this.connection.setFirstConnectionID(ConnectionID.randomConnectionID());
        this.connection.setSocket(socket);
    }

    public testSend() {
        var packetNumber = PacketNumber.randomPacketNumber();
        this.connection.setLocalPacketNumber(packetNumber);
        var version = new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
        this.connection.addStream(new Stream(Bignum.fromNumber(0), Bignum.fromNumber(Constants.DEFAULT_MAX_STREAM_DATA)));
        var clientInitial: ClientInitialPacket = PacketFactory.createClientInitialPacket(this.connection);
        this.connection.getSocket().send(clientInitial.toBuffer(this.connection), this.port, this.hostname);
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
            var receivedTime = Time.now(TimeFormat.MicroSeconds);
            var headerOffset: HeaderOffset = this.headerParser.parse(msg);
            this.headerHandler.handle(this.connection, headerOffset.header);
            var packetOffset: PacketOffset = this.packetParser.parse(this.connection, headerOffset, msg, EndpointType.Server);
            this.packetHandler.handle(this.connection, packetOffset.packet);
            this.connection.getAckHandler().onPacketReceived(packetOffset.packet, receivedTime);
            
        }catch(err) {
            // packet not parseable yet.
            console.log("Error: " + err.message);
            console.log("Stack: " + err.stack);
            return;
        }
    }

    private onError(error: Error): any {
        console.log("error");
    }

    private onClose(): any {
        console.log("close");
    }

}
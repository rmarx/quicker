import {TransportParameterType} from '../crypto/transport.parameters';
import {AEAD} from '../crypto/aead';
import {QTLS} from '../crypto/qtls';
import {ConnectionID, PacketNumber, Version} from '../types/header.properties';
import {Bignum} from './bignum';
import { RemoteInfo, Socket } from "dgram";
import {Stream} from './stream';
import { EndpointType } from './endpoint.type';
import { Constants } from '../utilities/constants';
import { TransportParameters } from '../crypto/transport.parameters';

export class Connection {

    private qtls: QTLS;
    private aead: AEAD;
    private socket: Socket;
    private remoteInfo: RemoteInformation;
    private endpointType: EndpointType;

    private firstConnectionID: ConnectionID;
    private connectionID: ConnectionID;
    private initialPacketNumber: PacketNumber;
    private packetNumber: PacketNumber;
    private serverTransportParameters: TransportParameters;
    private clientTransportParameters: TransportParameters;
    private version: Version;

    private state: ConnectionState;
    private streams: Stream[];

    public constructor(remoteInfo: RemoteInformation, endpointType: EndpointType, options?: any) {
        this.remoteInfo = remoteInfo;
        this.endpointType = endpointType;
        this.version = new Version(Buffer.from(Constants.getActiveVersion(), "hex"));
        this.qtls = new QTLS(endpointType === EndpointType.Server, options);
        this.aead = new AEAD();
        this.streams = [];
    }

    public getRemoteInfo(): RemoteInfo {
        return this.remoteInfo;
    }

    public getFirstConnectionID(): ConnectionID {
        return this.firstConnectionID;
    }

    public setFirstConnectionID(connectionID: ConnectionID): void{
        this.firstConnectionID = connectionID;
    }

    public getConnectionID(): ConnectionID {
        return this.connectionID;
    }

    public setConnectionID(connectionID: ConnectionID) {
        this.connectionID = connectionID;
    }

    public getState(): ConnectionState {
        return this.state;
    }

    public setState(connectionState: ConnectionState) {
        this.state = connectionState;
    }

    public getEndpointType(): EndpointType {
        return this.endpointType;
    }

    public getQuicTLS(): QTLS {
        return this.qtls;
    }

    public getAEAD(): AEAD {
        return this.aead;
    }

    public getServerTransportParameter(type: TransportParameterType): any {
        return this.serverTransportParameters.getTransportParameter(type);
    }

    public setServerTransportParameter(type: TransportParameterType, value: any): void {
        this.serverTransportParameters.setTransportParameter(type, value);
    }

    public getServerTransportParameters(): TransportParameters {
        return this.serverTransportParameters;
    }

    public setServerTransportParameters(transportParameters: TransportParameters): void {
        this.serverTransportParameters = transportParameters;
    }

    public getClientTransportParameter(type: TransportParameterType): any {
        return this.clientTransportParameters.getTransportParameter(type);
    }

    public setClientTransportParameter(type: TransportParameterType, value: any): void {
        this.clientTransportParameters.setTransportParameter(type, value);
    }

    public getClientTransportParameters(): TransportParameters {
        return this.clientTransportParameters;
    }

    public setClientTransportParameters(transportParameters: TransportParameters): void {
        this.clientTransportParameters = transportParameters;
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public getPacketNumber(): PacketNumber {
        return this.packetNumber;
    }

    public setPacketNumber(packetNumber: PacketNumber) {
        this.packetNumber = packetNumber;
    }

    public getNextPacketNumber(): PacketNumber {
        if (this.packetNumber === undefined) {
            this.packetNumber = PacketNumber.randomPacketNumber();
            this.initialPacketNumber = this.packetNumber;
            return this.packetNumber;
        }
        this.packetNumber.getPacketNumber().add(1);
        return this.packetNumber;
    }

    public getVersion(): Version {
        return this.version;
    }

    public setVersion(version: Version): void {
        this.version = version;
    }

    public setSocket(socket: Socket): void {
        this.socket = socket;
    }

    public getStream(streamId: Bignum): Stream | undefined {
        var res = undefined;
        this.streams.forEach((stream: Stream) => {
            if (stream.getStreamID().equals(streamId)) {
                res = stream;
            }
        });
        return res;
    }

    public addStream(stream: Stream): void {
        if (this.getStream(stream.getStreamID()) === undefined) {
            this.streams.push(stream);
        }
    }

    public deleteStream(streamId: Bignum): void;
    public deleteStream(stream: Stream): void;
    public deleteStream(obj: any): void {
        var stream = undefined;
        if (obj instanceof Bignum) {
            stream = this.getStream(obj);
        } else {
            stream = obj;
        }
        if (stream === undefined) {
            return;
        }
        var index = this.streams.indexOf(stream);
        if (index > -1) {
            this.streams.splice(index, 1);
        }
    }
}

export interface RemoteInformation {
    address: string;
    port: number, 
    family: string
}

export enum ConnectionState {
    HANDSHAKE,
    OPEN,
    CLOSING,
    CLOSED
}
import {QTLS} from '../crypto/qtls';
import {ConnectionID, PacketNumber} from '../packet/header/base.header';
import {Bignum} from '../utilities/bignum';
import { RemoteInfo, Socket } from "dgram";
import {Stream} from './stream';
import { EndpointType } from './type';
import { Constants } from './../utilities/constants';
import { Version } from './../packet/header/long.header';

export class Connection {

    private endpointType: EndpointType;
    private firstConnectionID: ConnectionID;
    private connectionID: ConnectionID;
    private remoteInfo: RemoteInfo;
    private state: ConnectionState;
    private streams: Stream[];
    private qtls: QTLS;
    private socket: Socket;
    private packetNumber: PacketNumber;

    public constructor(remoteInfo: RemoteInfo, endpointType: EndpointType, options?: any) {
        this.remoteInfo = remoteInfo;
        this.endpointType = endpointType;
        this.qtls = new QTLS(endpointType === EndpointType.Server, options)
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

    public getStream(streamId: Bignum): Stream | undefined {
        this.streams.forEach((stream: Stream) => {
            if (stream.getStreamID().equals(streamId)) {
                return stream;
            }
        });
        return undefined;
    }

    public getEndpointType(): EndpointType {
        return this.endpointType;
    }

    public getQuicTLS(): QTLS {
        return this.qtls;
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
        this.packetNumber.getPacketNumber().add(1);
        return this.packetNumber;
    }

    public getVersion(): Version {
        return new Version(Buffer.from(Constants.getActiveVersion(), 'hex'));
    }

    public setSocket(socket: Socket) {
        this.socket = socket;
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

export enum ConnectionState {
    HANDSHAKE,
    OPEN,
    CLOSING,
    CLOSED
}
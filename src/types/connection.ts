import { TransportParameterType } from '../crypto/transport.parameters';
import { AEAD } from '../crypto/aead';
import { QTLS, HandshakeState } from '../crypto/qtls';
import { ConnectionID, PacketNumber, Version } from '../types/header.properties';
import { Bignum } from './bignum';
import { RemoteInfo, Socket } from "dgram";
import { Stream } from './stream';
import { EndpointType } from './endpoint.type';
import { Constants } from '../utilities/constants';
import { TransportParameters } from '../crypto/transport.parameters';
import { BasePacket, PacketType } from './../packet/base.packet';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { AckHandler } from '../utilities/ack.handler';
import { PacketLogging } from '../utilities/logging/packet.logging';
import { FlowControlledObject } from './flow.controlled';
import { FlowControl } from '../utilities/flow.control';

export class Connection extends FlowControlledObject {

    private qtls: QTLS;
    private aead: AEAD;
    private socket: Socket;
    private remoteInfo: RemoteInformation;
    private endpointType: EndpointType;
    private ackHandler: AckHandler;
    private flowControl: FlowControl;

    private firstConnectionID: ConnectionID;
    private connectionID: ConnectionID;
    private initialPacketNumber: PacketNumber;
    private localPacketNumber: PacketNumber;
    private remotePacketNumber: PacketNumber;
    private localTransportParameters: TransportParameters;
    private remoteTransportParameters: TransportParameters;
    private version: Version;

    private state: ConnectionState;
    private streams: Stream[];

    public constructor(remoteInfo: RemoteInformation, endpointType: EndpointType, options?: any) {
        super();
        super.init(this);
        this.remoteInfo = remoteInfo;
        this.endpointType = endpointType;
        this.version = new Version(Buffer.from(Constants.getActiveVersion(), "hex"));
        this.qtls = new QTLS(endpointType === EndpointType.Server, options);
        this.aead = new AEAD();
        this.ackHandler = new AckHandler(this);
        this.flowControl = new FlowControl();
        this.streams = [];
    }

    public getRemoteInfo(): RemoteInfo {
        return this.remoteInfo;
    }

    public getFirstConnectionID(): ConnectionID {
        return this.firstConnectionID;
    }

    public setFirstConnectionID(connectionID: ConnectionID): void {
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

    public getAckHandler(): AckHandler {
        return this.ackHandler;
    }

    public getFlowControl(): FlowControl {
        return this.flowControl;
    }

    public getLocalTransportParameter(type: TransportParameterType): any {
        return this.localTransportParameters.getTransportParameter(type);
    }

    public setLocalTransportParameter(type: TransportParameterType, value: any): void {
        this.localTransportParameters.setTransportParameter(type, value);
    }

    public getLocalTransportParameters(): TransportParameters {
        return this.localTransportParameters;
    }

    public setLocalTransportParameters(transportParameters: TransportParameters): void {
        this.localTransportParameters = transportParameters;
    }

    public getRemoteTransportParameter(type: TransportParameterType): any {
        return this.remoteTransportParameters.getTransportParameter(type);
    }

    public setRemoteTransportParameter(type: TransportParameterType, value: any): void {
        this.remoteTransportParameters.setTransportParameter(type, value);
    }

    public getRemoteTransportParameters(): TransportParameters {
        return this.remoteTransportParameters;
    }

    public setRemoteTransportParameters(transportParameters: TransportParameters): void {
        this.remoteTransportParameters = transportParameters;
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public getLocalPacketNumber(): PacketNumber {
        return this.localPacketNumber;
    }

    public setLocalPacketNumber(packetNumber: PacketNumber) {
        this.localPacketNumber = packetNumber;
    }

    public getNextPacketNumber(): PacketNumber {
        if (this.localPacketNumber === undefined) {
            this.localPacketNumber = PacketNumber.randomPacketNumber();
            this.initialPacketNumber = this.localPacketNumber;
            return this.localPacketNumber;
        }
        var bn = this.localPacketNumber.getPacketNumber().add(1);
        this.localPacketNumber.setPacketNumber(bn);
        return this.localPacketNumber;
    }

    public getRemotePacketNumber(): PacketNumber {
        return this.remotePacketNumber;
    }

    public setRemotePacketNumber(packetNumber: PacketNumber) {
        this.remotePacketNumber = packetNumber;
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

    public getStream(streamId: Bignum): Stream {
        var stream = this._getStream(streamId);
        if (stream === undefined) {
            stream = new Stream(this, streamId);
            this.addStream(stream);
            if (streamId.compare(Bignum.fromNumber(0)) !== 0) {
                this.initializeStream(stream);
            }
        }
        return stream;
    }

    private initializeStream(stream: Stream): void {
        stream.setLocalMaxData(this.localTransportParameters.getTransportParameter(TransportParameterType.MAX_STREAM_DATA));
        stream.setRemoteMaxData(this.remoteTransportParameters.getTransportParameter(TransportParameterType.MAX_STREAM_DATA));
    }

    private _getStream(streamId: Bignum): Stream | undefined {
        var res = undefined;
        this.streams.forEach((stream: Stream) => {
            if (stream.getStreamID().equals(streamId)) {
                res = stream;
            }
        });
        return res;
    }

    public addStream(stream: Stream): void {
        if (this._getStream(stream.getStreamID()) === undefined) {
            this.streams.push(stream);
        }
    }

    public deleteStream(streamId: Bignum): void;
    public deleteStream(stream: Stream): void;
    public deleteStream(obj: any): void {
        var stream = undefined;
        if (obj instanceof Bignum) {
            stream = this._getStream(obj);
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

    public resetConnectionState() {
        this.remotePacketNumber = new PacketNumber(Bignum.fromNumber(-1).toBuffer());
        this.resetOffsets();
    }

    /**
     * Method to send a packet
     * TODO: Should create a sendFrame method and/or put a timer on this,when for example 2 ShortHeaderPackets are sent, bundle the frames and send as one packet
     * @param basePacket packet to send
     */
    public sendPacket(basePacket: BasePacket): void {
        if (basePacket.getPacketType() !== PacketType.Retry && basePacket.getPacketType() !== PacketType.VersionNegotiation) {
            var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>basePacket;
            var ackFrame = this.ackHandler.getAckFrame(this);
            if (ackFrame !== undefined) {
                baseEncryptedPacket.getFrames().push(ackFrame);
            }
        }
        var packet = this.flowControl.onPacketSend(this, basePacket);
        if (packet !== undefined) {
            PacketLogging.getInstance().logOutgoingPacket(this, packet);
            this.getSocket().send(packet.toBuffer(this), this.getRemoteInfo().port, this.getRemoteInfo().address);
        }
    }
}

export interface RemoteInformation {
    address: string;
    port: number,
    family: string
}

export enum ConnectionState {
    Handshake,
    Open,
    Closing,
    Draining,
    Closed
}
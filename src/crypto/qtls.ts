import {Constants} from '../utilities/constants';
import {Connection} from '../quicker/connection';
import {TransportParameters} from './transport.parameters';
import { QuicTLS } from "qtls_wrap";

/**
 * QuicTLS Wrapper
 */
export class QTLS {
    private handshakeState: HandshakeState;
    private qtlsHelper: QuicTLS;
    private isServer: boolean;
    private options: any;
    private transportParameters: TransportParameters;

    private cipher: string;

    public constructor(isServer: boolean, options: any) {
        this.isServer = isServer;
        this.options = options;
        this.qtlsHelper = new QuicTLS(this.isServer, this.options);
        if (this.isServer) {
            this.handshakeState = HandshakeState.SERVER_HELLO;
        } else {
            this.handshakeState = HandshakeState.CLIENT_HELLO;
        }
    }

    public setTransportParameters(buffer: Buffer, createNew: boolean = false) {
        if (this.qtlsHelper === undefined || createNew) {
            this.qtlsHelper = new QuicTLS(this.isServer, this.options);
        }
        this.qtlsHelper.setTransportParameters(buffer);
    }

    public getClientInitial(connection: Connection): Buffer {
        var transportParams = this.getExtensionData(connection);
        this.setTransportParameters(transportParams);
        var clientInitialBuffer = this.qtlsHelper.getClientInitial();
        if (clientInitialBuffer === undefined) {
            throw new Error("Client initial failed");
        }
        return clientInitialBuffer;
    }

    public readHandshake(): Buffer  {
        var handshakeBuffer = this.qtlsHelper.readHandshakeData();
        if (handshakeBuffer === undefined) {
            throw new Error("Handshake failed");
        }
        return handshakeBuffer;
    }

    public writeHandshake(connection: Connection, buffer: Buffer) {
        if (this.isServer && HandshakeState.HANDSHAKE) {
            this.handshakeState = HandshakeState.NEW_SESSION_TICKET;
        } else {
            this.handshakeState = HandshakeState.HANDSHAKE;
        }
        // only servers needs to add extension data here
        if (this.isServer) {
            var transportParams = this.getExtensionData(connection);
            this.setTransportParameters(transportParams);
        }
        this.qtlsHelper.writeHandshakeData(buffer);
    }

    public getHandshakeState(): HandshakeState {
        return this.handshakeState;
    }

    public getCipher() {
        return this.cipher;
    }

    public setCipher(cipher: string) {
        this.cipher = cipher;
    }

    private getExtensionData(connection: Connection): Buffer {
        var transportParamBuffer: Buffer = this.getTransportParameters().toBuffer();
        // value of 6 is: 4 for version and 2 for length
        var transportExt = Buffer.alloc(this.getExtensionDataSize(transportParamBuffer));
        var offset = 0;
        if (this.isServer) {
            if (this.handshakeState === HandshakeState.HANDSHAKE) {
                transportExt.write(Constants.getActiveVersion(), offset, undefined, 'hex');
                offset += 4;
                Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                    transportExt.write(version, offset, undefined, 'hex');
                    offset += 4;
                });
            }
        } else {
            transportExt.write(Constants.getActiveVersion(), undefined, undefined, 'hex');
            offset += 4;
        }
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, offset);
        offset += 2;
        transportParamBuffer.copy(transportExt, offset);
        return transportExt;
    }
    private getTransportParameters() {
        if (this.transportParameters === undefined) {
            this.transportParameters = new TransportParameters(false, Constants.DEFAULT_MAX_STREAM_DATA, Constants.DEFAULT_MAX_DATA, Constants.MAX_IDLE_TIMEOUT);
        }
        return this.transportParameters;
    }

    private getExtensionDataSize(transportParamBuffer: Buffer) {
        if (this.isServer) {
            if (this.handshakeState === HandshakeState.HANDSHAKE) {
                transportParamBuffer.byteLength + 6 + Constants.SUPPORTED_VERSIONS.length * 6;
            }
            return transportParamBuffer.byteLength;
        }
        return transportParamBuffer.byteLength + 6;
    }
}

export enum HandshakeState {
    CLIENT_HELLO,
    SERVER_HELLO,
    HANDSHAKE,
    NEW_SESSION_TICKET,
    COMPLETED
};
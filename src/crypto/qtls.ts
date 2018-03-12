import { HandshakeValidation } from '../utilities/validation/handshake.validation';
import { Bignum } from '../types/bignum';
import { Constants } from '../utilities/constants';
import { Connection } from '../types/connection';
import { TransportParameters, TransportParameterType } from './transport.parameters';
import { QuicTLS } from "qtls_wrap";
import { Cipher } from './cipher';
import { EventEmitter } from 'events';

enum NodeQTLSEvent {
    HANDSHAKE_DONE = "handshakedone"
}

/**
 * QuicTLS Wrapper
 */
export class QTLS extends EventEmitter{
    private handshakeState: HandshakeState;
    private qtlsHelper: QuicTLS;
    private isServer: boolean;
    private options: any;
    private transportParameters!: TransportParameters;

    private cipher!: Cipher;

    public constructor(isServer: boolean, options: any = {}, connection: Connection) {
        super();
        this.isServer = isServer;
        this.options = options;
        if (options.alpnProtocol === undefined) {
            this.options.alpnProtocols = [Constants.ALPN_LABEL];
        }
        if (options.transportparameters !== undefined) {
            connection.setRemoteTransportParameters(TransportParameters.fromBuffer(connection, options.transportparameters));
            connection.setLocalTransportParameters(this.getTransportParameters());
        }
        if (this.isServer) {
            this.handshakeState = HandshakeState.SERVER_HELLO;
        } else {
            this.handshakeState = HandshakeState.CLIENT_HELLO;
        }
        this.qtlsHelper = this.createQtlsHelper(connection);
    }

    private createQtlsHelper(connection: Connection): QuicTLS {
        var qtlsHelper = new QuicTLS(this.isServer, this.options);
        qtlsHelper.on(NodeQTLSEvent.HANDSHAKE_DONE, () => {
            this.handleHandshakeDone();
        });
        return qtlsHelper;
    }

    protected setTransportParameters(buffer: Buffer, connection: Connection, createNew: boolean = false): void {
        if (createNew) {
            this.qtlsHelper = this.createQtlsHelper(connection);
        }
        this.qtlsHelper.setTransportParameters(buffer);
    }

    public getExtensionData(): Buffer {
        return this.qtlsHelper.getTransportParameters();
    }

    public getClientInitial(connection: Connection, createNew = false): Buffer {
        if (!this.isEarlyDataAllowed()) {
            this.setLocalTransportParameters(connection);
        }
        var clientInitialBuffer = this.qtlsHelper.getClientInitial();
        return clientInitialBuffer;
    }

    public readHandshake(connection: Connection): Buffer {
        var handshakeBuffer = this.qtlsHelper.readHandshakeData();

        if (this.isEarlyDataAllowed() && this.isSessionReused()) {
            this.emit(QuicTLSEvents.EARLY_DATA_ALLOWED);
        }

        var extensionData = this.getExtensionData();
        if (extensionData.byteLength > 0) {
            var transportParameters: TransportParameters = HandshakeValidation.validateExtensionData(connection, extensionData);
            connection.setRemoteTransportParameters(transportParameters);
        }
        return handshakeBuffer;
    }

    public readEarlyData(): Buffer {
        return this.qtlsHelper.readEarlyData();
    }

    public writeHandshake(connection: Connection, buffer: Buffer): void {
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            if (this.isServer && this.handshakeState === HandshakeState.HANDSHAKE) {
                this.handshakeState = HandshakeState.NEW_SESSION_TICKET;
            } else if(this.handshakeState !== HandshakeState.CLIENT_COMPLETED){
                this.handshakeState = HandshakeState.HANDSHAKE;
                if (this.isServer) {
                    this.setLocalTransportParameters(connection);
                }
            }
        }
        this.qtlsHelper.writeHandshakeData(buffer);
    }

    public writeEarlyData(connection: Connection, earlyData: Buffer) {
        this.setLocalTransportParameters(connection);
        return this.qtlsHelper.writeEarlyData(earlyData);
    }

    public getHandshakeState(): HandshakeState {
        return this.handshakeState;
    }

    public exportKeyingMaterial(label: string): Buffer {
        return this.qtlsHelper.exportKeyingMaterial(Buffer.from(label), this.cipher.getHashLength());
    }

    public exportEarlyKeyingMaterial(label: string): Buffer {
        return this.qtlsHelper.exportEarlyKeyingMaterial(Buffer.from(label), this.cipher.getHashLength());
    }

    public getCipher(): Cipher {
        if (this.cipher === undefined) {
            this.cipher = new Cipher(this.qtlsHelper.getNegotiatedCipher());
        }
        return this.cipher;
    }

    public getSession(): Buffer {
        return this.qtlsHelper.getSession();
    }

    public readSSL(): Buffer {
        if (this.handshakeState === HandshakeState.CLIENT_COMPLETED) {
            this.handshakeState = HandshakeState.COMPLETED;
        }
        return this.qtlsHelper.readSSL();
    }

    public setSession(buffer: Buffer): void {
        this.qtlsHelper.setSession(buffer);
    }

    public isSessionReused(): boolean {
        return this.qtlsHelper.isSessionReused();
    }

    public isEarlyDataAllowed(): boolean {
        return this.qtlsHelper.isEarlyDataAllowed();
    }

    private generateExtensionData(connection: Connection): Buffer {
        var transportParamBuffer: Buffer = this.getTransportParameters().toBuffer();
        // value of 6 is: 4 for version and 2 for length
        var transportExt = Buffer.alloc(this.getExtensionDataSize(transportParamBuffer));
        var offset = 0;
        if (this.isServer) {
            // version in the connection holds the negotiated version
            transportExt.write(connection.getVersion().toString(), offset, 4, 'hex');
            offset += 4;
            transportExt.writeUInt8(Constants.SUPPORTED_VERSIONS.length * 4, offset++);
            Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                transportExt.write(version, offset, 4, 'hex');
                offset += 4;
            });
        } else {
            // Active version holds the first version that was 'tried' to negotiate
            // so this is always the initial version
            transportExt.write(connection.getVersion().toString(), offset, 4, 'hex');
            offset += 4;
        }
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, offset);
        offset += 2;
        transportParamBuffer.copy(transportExt, offset);
        return transportExt;
    }

    private getTransportParameters(): TransportParameters {
        if (this.transportParameters === undefined) {
            this.transportParameters = new TransportParameters(this.isServer, Constants.DEFAULT_MAX_STREAM_DATA, Constants.DEFAULT_MAX_DATA, Constants.DEFAULT_IDLE_TIMEOUT);
            this.transportParameters.setTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT, Constants.DEFAULT_ACK_EXPONENT);
            if (this.isServer) {
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI, Constants.DEFAULT_MAX_STREAM_CLIENT_BIDI);
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_ID_UNI, Constants.DEFAULT_MAX_STREAM_CLIENT_UNI);
                // TODO: better to calculate this value
                this.transportParameters.setTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, Bignum.random('ffffffffffffffffffffffffffffffff', 16).toBuffer());
            } else {
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI, Constants.DEFAULT_MAX_STREAM_SERVER_BIDI);
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_ID_UNI, Constants.DEFAULT_MAX_STREAM_SERVER_UNI);
            }
        }
        return this.transportParameters;
    }

    private getExtensionDataSize(transportParamBuffer: Buffer): number {
        if (this.isServer) {
            if (this.handshakeState === HandshakeState.HANDSHAKE) {
                return transportParamBuffer.byteLength + 6 + Constants.SUPPORTED_VERSIONS.length * 4 + 1;
            }
            return transportParamBuffer.byteLength + 2;
        }
        return transportParamBuffer.byteLength + 6;
    }

    private handleHandshakeDone(): void {
        if (this.isServer) {
            this.handshakeState = HandshakeState.COMPLETED;
        } else {
            this.handshakeState = HandshakeState.CLIENT_COMPLETED;
        }
        // Get 1-RTT Negotiated Cipher
        this.cipher = new Cipher(this.qtlsHelper.getNegotiatedCipher());
    }

    private setLocalTransportParameters(connection: Connection) {
        var transportParams = this.generateExtensionData(connection);
        this.setTransportParameters(transportParams, connection);
        connection.setLocalTransportParameters(this.getTransportParameters());
    }
}

export enum HandshakeState {
    CLIENT_HELLO,
    SERVER_HELLO,
    HANDSHAKE,
    NEW_SESSION_TICKET,
    CLIENT_COMPLETED,
    COMPLETED
};

export enum QuicTLSEvents {
    EARLY_DATA_ALLOWED = "qtls-early-data-allowed"
}
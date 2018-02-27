import {HandshakeValidation} from '../utilities/validation/handshake.validation';
import { Bignum } from '../types/bignum';
import { Constants } from '../utilities/constants';
import { Connection } from '../types/connection';
import { TransportParameters, TransportParameterType } from './transport.parameters';
import { QuicTLS } from "qtls_wrap";
import { Cipher } from './cipher';
import { EventEmitter } from 'events';
import { EventConstants } from '../utilities/event.constants';

/**
 * QuicTLS Wrapper
 */
export class QTLS {
    private handshakeState: HandshakeState;
    private qtlsHelper: QuicTLS;
    private isServer: boolean;
    private options: any;
    private transportParameters!: TransportParameters;

    private cipher!: Cipher;

    public constructor(isServer: boolean, options: any, connection: Connection) {
        this.isServer = isServer;
        this.options = options;
        if (this.options === undefined) {
            this.options = { alpnProtocol: Constants.ALPN_LABEL }
        } else {
            this.options.alpnProtocol = Constants.ALPN_LABEL;
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
        qtlsHelper.on(EventConstants.NODE_QTLS_HANDSHAKE_DONE, () => {
            var extensionData = this.getExtensionData();
            var transportParameters: TransportParameters = HandshakeValidation.validateExtensionData(connection, extensionData);
            connection.setRemoteTransportParameters(transportParameters);
            connection.setRemoteMaxData(transportParameters.getTransportParameter(TransportParameterType.MAX_DATA));
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

    public getClientInitial(connection: Connection): Buffer {
        var transportParams = this.generateExtensionData(connection);
        this.setTransportParameters(transportParams, connection, true);
        connection.setLocalTransportParameters(this.getTransportParameters());
        connection.setLocalMaxData(connection.getLocalTransportParameter(TransportParameterType.MAX_DATA));
        var clientInitialBuffer = this.qtlsHelper.getClientInitial();
        return clientInitialBuffer;
    }

    public readHandshake(): Buffer {
        var handshakeBuffer = this.qtlsHelper.readHandshakeData();
        return handshakeBuffer;
    }

    public writeHandshake(connection: Connection, buffer: Buffer): void {
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            if (this.isServer && this.handshakeState === HandshakeState.HANDSHAKE) {
                this.handshakeState = HandshakeState.NEW_SESSION_TICKET;
            } else {
                this.handshakeState = HandshakeState.HANDSHAKE;
                if (this.isServer) {
                    var transportParams = this.generateExtensionData(connection);
                    this.setTransportParameters(transportParams, connection);
                    connection.setLocalTransportParameters(this.getTransportParameters());
                    connection.setLocalMaxData(connection.getLocalTransportParameter(TransportParameterType.MAX_DATA));
                }
            }
        }
        this.qtlsHelper.writeHandshakeData(buffer);
    }

    public getHandshakeState(): HandshakeState {
        return this.handshakeState;
    }

    public exportKeyingMaterial(label: string): Buffer {
        return this.qtlsHelper.exportKeyingMaterial(Buffer.from(label), this.cipher.getHashLength());
    }

    public getCipher(): Cipher {
        return this.cipher;
    }

    public getSession(): Buffer{
        return this.qtlsHelper.getSession();
    }

    public readSSL(): Buffer{
        return this.qtlsHelper.readSSL();
    }

    public setSession(buffer: Buffer): void{
        this.qtlsHelper.setSession(buffer);
    }

    public isSessionReused(): boolean {
        return this.qtlsHelper.isSessionReused();
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
        this.handshakeState = HandshakeState.COMPLETED;
        this.cipher = new Cipher(this.qtlsHelper.getNegotiatedCipher());
    }
}

export enum HandshakeState {
    CLIENT_HELLO,
    SERVER_HELLO,
    HANDSHAKE,
    NEW_SESSION_TICKET,
    COMPLETED
};
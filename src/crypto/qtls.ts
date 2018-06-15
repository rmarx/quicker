

import { HandshakeValidation } from '../utilities/validation/handshake.validation';
import { Bignum } from '../types/bignum';
import { Constants } from '../utilities/constants';
import { Connection } from '../quicker/connection';
import { TransportParameters, TransportParameterType } from './transport.parameters';
import { QuicTLS } from "qtls_wrap";
import { Cipher } from './cipher';
import { EventEmitter } from 'events';
import { QuicError } from '../utilities/errors/connection.error';
import { TlsErrorCodes } from '../utilities/errors/quic.codes';

enum NodeQTLSEvent {
    HANDSHAKE_DONE = "handshakedone",
    ERROR = "error",
    NEW_SESSION = "newsession",
}

/**
 * QuicTLS Wrapper
 */
export class QTLS extends EventEmitter{
    private handshakeState: HandshakeState;
    private qtlsHelper!: QuicTLS;
    private isServer: boolean;
    private options: any;
    private transportParameters!: TransportParameters;

    private cipher!: Cipher;
    private connection: Connection;

    public constructor(isServer: boolean, options: any = {}, connection: Connection) {
        super();
        this.isServer = isServer;
        this.options = options === undefined ? {} : options;
        this.connection = connection;
        if (this.isServer) {
            this.handshakeState = HandshakeState.SERVER_HELLO;
        } else {
            this.handshakeState = HandshakeState.CLIENT_HELLO;
        }
    }

    public init() {
        if (this.options.alpnProtocol === undefined) {
            this.options.alpnProtocols = [Constants.ALPN_LABEL];
        }
        if (this.options.transportparameters !== undefined) {
            this.emit(QuicTLSEvents.REMOTE_TRANSPORTPARAM_AVAILABLE, TransportParameters.fromBuffer(this.isServer, this.options.transportparameters));
            this.emit(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, this.getTransportParameters());
        }
        this.qtlsHelper = this.createQtlsHelper();
    }

    private createQtlsHelper(): QuicTLS {
        var qtlsHelper = new QuicTLS(this.isServer, this.options);
        qtlsHelper.on(NodeQTLSEvent.HANDSHAKE_DONE, () => {
            this.handleHandshakeDone();
        });
        qtlsHelper.on(NodeQTLSEvent.ERROR, (error: Error) => {
            throw new QuicError(TlsErrorCodes.TLS_HANDSHAKE_FAILED);
        });
        qtlsHelper.on(NodeQTLSEvent.NEW_SESSION, () => {
            this.handleNewSession();
        });
        return qtlsHelper;
    }

    public getExtensionData(): Buffer {
        return this.qtlsHelper.getTransportParameters();
    }

    public getClientInitial(createNew = false): Buffer {
        // TODO: this currently never happens in the codebase: for which use-case is this?
        if (createNew) {
            this.qtlsHelper = this.createQtlsHelper();
        }

        if (this.isEarlyDataAllowed()) {
            // OpenSSL requires we write some early data first if we want to use it, but cannot write the real early data yet (QUIC uses 0-RTT packet logic), 
            // so write an empty string for now, this triggers the necessary internal state changes 
            // "When called by a client, SSL_write_early_data() must be the first IO function called on a new connection" 
            //  => https://www.openssl.org/docs/man1.1.1/man3/SSL_write_early_data.html 
            // REFACTOR TODO: if this is just an anomaly of OpenSSL, move it to the C++ side?
            this.qtlsHelper.writeEarlyData(Buffer.from(""));
        }
        
        this.setLocalTransportParameters();

        // this will call SSL_do_handshake internally, which generates the ClientHello message (containing the LocalTransportParameters)
        var clientInitialBuffer = this.qtlsHelper.getClientInitial();
        return clientInitialBuffer;
    }

    public readHandshake(): Buffer {
        var handshakeBuffer = this.qtlsHelper.readHandshakeData();

        if (this.isEarlyDataAllowed() && this.isSessionReused()) {
            this.emit(QuicTLSEvents.EARLY_DATA_ALLOWED);
        }

        var extensionData = this.getExtensionData();
        if (extensionData.byteLength > 0) {
            var transportParameters: TransportParameters = HandshakeValidation.validateExtensionData(this.isServer, extensionData);
            this.emit(QuicTLSEvents.REMOTE_TRANSPORTPARAM_AVAILABLE, transportParameters);
        }
        return handshakeBuffer;
    }

    public readEarlyData(): Buffer {
        return this.qtlsHelper.readEarlyData();
    }

    public writeHandshake(buffer: Buffer): void {
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            if(this.handshakeState !== HandshakeState.CLIENT_COMPLETED){
                this.handshakeState = HandshakeState.HANDSHAKE;
                if (this.isServer) {
                    this.setLocalTransportParameters();
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

    private generateExtensionData(): Buffer {
        var transportParamBuffer: Buffer = this.getTransportParameters().toBuffer();
        // value of 6 is: 4 for version and 2 for length
        var transportExt = Buffer.alloc(this.getExtensionDataSize(transportParamBuffer));
        var offset = 0;
        if (this.isServer) {
            // version in the connection holds the negotiated version
            transportExt.write(this.connection.getVersion().toString(), offset, 4, 'hex');
            offset += 4;
            transportExt.writeUInt8(Constants.SUPPORTED_VERSIONS.length * 4, offset++);
            Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                transportExt.write(version, offset, 4, 'hex');
                offset += 4;
            });
        } else {
            // Active version holds the first version that was 'tried' to negotiate
            // so this is always the initial version
            transportExt.write(Constants.getActiveVersion(), offset, 4, 'hex');
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
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAMS_BIDI, Constants.DEFAULT_MAX_STREAM_CLIENT_BIDI);
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAMS_UNI, Constants.DEFAULT_MAX_STREAM_CLIENT_UNI);
                // TODO: better to calculate this value
                this.transportParameters.setTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, Bignum.random('ffffffffffffffffffffffffffffffff', 16).toBuffer());
            } else {
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAMS_BIDI, Constants.DEFAULT_MAX_STREAM_SERVER_BIDI);
                this.transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_STREAMS_UNI, Constants.DEFAULT_MAX_STREAM_SERVER_UNI);
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
        // Get 1-RTT Negotiated Cipher
        this.cipher = new Cipher(this.qtlsHelper.getNegotiatedCipher());
        if (this.handshakeState >= HandshakeState.CLIENT_COMPLETED) {
            return;
        }
        // Set handshake state
        if (this.isServer) {
            this.handshakeState = HandshakeState.SERVER_COMPLETED;
        } else {
            this.handshakeState = HandshakeState.CLIENT_COMPLETED;
        }
    }

    private handleNewSession(): void {
        this.handshakeState = HandshakeState.COMPLETED;
    }

    private setLocalTransportParameters() {
        var transportParams = this.generateExtensionData();
        this.qtlsHelper.setTransportParameters(transportParams);
        this.emit(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, this.getTransportParameters());
    }
}

export enum HandshakeState {
    CLIENT_HELLO,
    SERVER_HELLO,
    HANDSHAKE,
    CLIENT_COMPLETED,
    SERVER_COMPLETED,
    COMPLETED
};

export enum QuicTLSEvents {
    EARLY_DATA_ALLOWED = "qtls-early-data-allowed",
    REMOTE_TRANSPORTPARAM_AVAILABLE = "qtls-remote-transportparam-available",
    LOCAL_TRANSPORTPARAM_AVAILABLE = "qtls-local-transportparam-available"
}
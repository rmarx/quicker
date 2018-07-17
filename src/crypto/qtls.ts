

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
import { EndpointType } from '../types/endpoint.type';
import { VerboseLogging } from '../utilities/logging/verbose.logging';

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
            this.emit(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, TransportParameters.getDefaultTransportParameters(this.isServer, this.connection.getVersion()));
        }
        if (this.isServer) {
            this.qtlsHelper = this.createQtlsHelper();
        }
    }

    private createQtlsHelper(): QuicTLS {
	this.options.logLevel = VerboseLogging.getLogLevel();

        var qtlsHelper = new QuicTLS(this.isServer, this.options);
        qtlsHelper.on(NodeQTLSEvent.HANDSHAKE_DONE, () => {
            this.handleHandshakeDone();
        });
        qtlsHelper.on(NodeQTLSEvent.ERROR, (error: Error) => {
            throw new QuicError(TlsErrorCodes.TLS_HANDSHAKE_FAILED, error.message);
        });
        qtlsHelper.on(NodeQTLSEvent.NEW_SESSION, () => {
            this.handleNewSession();
        });
        return qtlsHelper;
    }

    public getExtensionData(): Buffer {
        return this.qtlsHelper.getTransportParameters();
    }

    public getClientInitial(): Buffer {
        // TODO: this currently never happens in the codebase: for which use-case is this?
        this.qtlsHelper = this.createQtlsHelper();
        this.setLocalTransportParameters();

        if (this.isEarlyDataAllowed()) {
            // OpenSSL requires we write some early data first if we want to use it, but cannot write the real early data yet (QUIC uses 0-RTT packet logic), 
            // so write an empty string for now, this triggers the necessary internal state changes 
            // "When called by a client, SSL_write_early_data() must be the first IO function called on a new connection" 
            //  => https://www.openssl.org/docs/man1.1.1/man3/SSL_write_early_data.html 
            // REFACTOR TODO: if this is just an anomaly of OpenSSL, move it to the C++ side?
            this.qtlsHelper.writeEarlyData(Buffer.from(""));
        }

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
        this.transportParameters = TransportParameters.getDefaultTransportParameters(this.isServer,this.connection.getVersion());
        var version = this.connection.getVersion();
        if (this.connection.getEndpointType() === EndpointType.Client) {
            version = this.connection.getInitialVersion();
        }
        var transportParams = this.transportParameters.toExtensionDataBuffer(this.handshakeState, version);
        this.qtlsHelper.setTransportParameters(transportParams);
        this.emit(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, this.transportParameters);
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

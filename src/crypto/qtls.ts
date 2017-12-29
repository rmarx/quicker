import {Bignum} from '../types/bignum';
import {Constants} from '../utilities/constants';
import {Connection} from '../types/connection';
import {TransportParameters, TransportParameterType} from './transport.parameters';
import { QuicTLS } from "qtls_wrap";
import {createHash, createCipheriv} from "crypto";

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
        this.qtlsHelper.on('handshakedone', () => {
            this.handleHandshakeDone();
        });
    }

    protected setTransportParameters(buffer: Buffer, createNew: boolean = false) {
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
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            if (this.isServer && this.handshakeState === HandshakeState.HANDSHAKE) {
                this.handshakeState = HandshakeState.NEW_SESSION_TICKET;
            } else {
                this.handshakeState = HandshakeState.HANDSHAKE;
            }
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

    public getHash(): string {
        switch(this.cipher) {
            case "TLS13-AES-128-GCM-SHA256":
            case "TLS13-CHACHA20-POLY1305-SHA256":
                return "sha256";
            case "TLS13-AES-256-GCM-SHA384":
                return "sha384";
        }
        throw new Error("Unsupported hash function " + this.cipher);
    }

    public getHashLength(): number {
        return createHash(this.getHash()).digest().length;
    }

    public getAEAD(): string {
        switch(this.cipher) {
            case "TLS13-AES-128-GCM-SHA256":
                return "aes-128-gcm";
            case "TLS13-CHACHA20-POLY1305-SHA256":
                return "chacha20-poly1305";
            case "TLS13-AES-256-GCM-SHA384":
                return "aes-256-gcm";
        }
        throw new Error("Unsupported aead function " + this.cipher);

    }

    public getAEADKeyLength(): number {
        var aead = this.getAEAD();
        switch(aead) {
            case "aes-128-gcm":
                return 16;
            case "aes-256-gcm":
                return 32;
            case "chacha20-poly1305":
                return 32;
        }
        throw new Error("Unsupported aead function");
    }

    public exportKeyingMaterial(label: string): Buffer {
        console.log("label: " + label);
        return this.qtlsHelper.exportKeyingMaterial(Buffer.from(label), this.getHashLength());
    }


    private getExtensionData(connection: Connection): Buffer {
        var transportParamBuffer: Buffer = this.getTransportParameters().toBuffer();
        // value of 6 is: 4 for version and 2 for length
        var transportExt = Buffer.alloc(this.getExtensionDataSize(transportParamBuffer));
        var offset = 0;
        if (this.isServer) {
            if (this.handshakeState === HandshakeState.HANDSHAKE) {
                transportExt.write(Constants.getActiveVersion(), offset, 4, 'hex');
                offset += 4;
                transportExt.writeUInt8(Constants.SUPPORTED_VERSIONS.length * 4, offset++);
                Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                    transportExt.write(version, offset, 4, 'hex');
                    offset += 4;
                });
            }
        } else {
            transportExt.write(Constants.getActiveVersion(), offset, 4, 'hex');
            offset += 4;
        }
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, offset);
        offset += 2;
        transportParamBuffer.copy(transportExt, offset);
        return transportExt;
    }
    private getTransportParameters() {
        if (this.transportParameters === undefined) {
            this.transportParameters = new TransportParameters(this.isServer, Constants.DEFAULT_MAX_STREAM_DATA, Constants.DEFAULT_MAX_DATA, Constants.MAX_IDLE_TIMEOUT);
            if (this.isServer) {
                this.transportParameters.setTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, Bignum.random('ffffffffffffffffffffffffffffffff', 16).toBuffer());
            }
        }
        return this.transportParameters;
    }

    private getExtensionDataSize(transportParamBuffer: Buffer) {
        if (this.isServer) {
            if (this.handshakeState === HandshakeState.HANDSHAKE) {
                return transportParamBuffer.byteLength + 6 + Constants.SUPPORTED_VERSIONS.length * 4 + 1;
            }
            return transportParamBuffer.byteLength;
        }
        return transportParamBuffer.byteLength + 6;
    }

    private handleHandshakeDone() {
        this.handshakeState = HandshakeState.COMPLETED;
        this.cipher = this.qtlsHelper.getNegotiatedCipher();
    }
}

export enum HandshakeState {
    CLIENT_HELLO,
    SERVER_HELLO,
    HANDSHAKE,
    NEW_SESSION_TICKET,
    COMPLETED
};
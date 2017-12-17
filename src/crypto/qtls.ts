import { QuicTLS } from "qtls_wrap";

/**
 * QuicTLS Wrapper
 */
export class QTLS {
    private qtlsHelper: QuicTLS;
    private isServer: boolean;

    private cipher: string;

    public constructor(isServer: boolean) {
        this.isServer = isServer;
    }

    public setTransportParameters(buffer: Buffer, createNewHelper: boolean = true) {
        if(this.qtlsHelper === undefined || createNewHelper) {
            this.qtlsHelper = new QuicTLS(this.isServer, {});
        }
    }

    public getClientInitial(): Buffer {
        return this.qtlsHelper.getClientInitial();
    }

    public readHandshake(): Buffer {
        return this.qtlsHelper.readHandshakeData();
    }

    public writeHandshake(buffer: Buffer) {
        this.qtlsHelper.writeHandshakeData(buffer);
    }

    public getCipher() {
        return this.cipher;
    }

    public setCipher(cipher: string) {
        this.cipher = cipher;
    }
}
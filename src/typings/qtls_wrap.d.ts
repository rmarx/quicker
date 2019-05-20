import qtls = require("qtls_wrap");

export as namespace qtls_wrap;

export class QuicTLS {
    constructor(isServer: boolean, options:any);

    readHandshakeData(): Buffer;
    readEarlyData(): Buffer;
    readSSL(): Buffer;
    writeHandshakeData(buffer: Buffer): number;
    writeEarlyData(buffer: Buffer): number;
    getClientInitial(): Buffer;
    setTransportParameters(buffer: Buffer): void;
    getTransportParameters(): Buffer;
    on(event: string, callback: Function): void;
    exportKeyingMaterial(buffer: Buffer, hashsize: number): Buffer;
    exportEarlyKeyingMaterial(buffer: Buffer, hashsize: number): Buffer;
    getNegotiatedCipher(): string;
    getSession(): Buffer;
    getNegotiatedALPN(): Buffer;
    setSession(buffer: Buffer): void;
    isSessionReused(): boolean;
    isEarlyDataAllowed(): boolean;
}
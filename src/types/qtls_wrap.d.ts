import qtls = require("qtls_wrap");

export as namespace qtls_wrap;

export class QuicTLS {
    constructor(isServer: boolean, options:any);

    readHandshakeData(): Buffer;
    writeHandshakeData(buffer: Buffer): number;
    getClientInitial(): Buffer;
    setTransportParameters(buffer: Buffer): void;
}
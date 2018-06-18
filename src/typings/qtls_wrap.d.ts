import qtls = require("qtls_wrap");

export as namespace qtls_wrap;

// interface for the Node-level code.
// This is limited to just 3 files in a separate repo:
// https://github.com/rmarx/node/blob/add_quicker_support-tls-d28/lib/qtls_wrap.js // direct JS wrapper, is the interface to the class in this file
// https://github.com/rmarx/node/blob/add_quicker_support-tls-d28/src/qtls_wrap.h  // C++ implementation, interfaces with qtls_wrap.js  
// https://github.com/rmarx/node/blob/add_quicker_support-tls-d28/src/qtls_wrap.cc // C++ implementation, interfaces with qtls_wrap.js  

export class QuicTLS {
    constructor(isServer: boolean, options:any);

    // server-side
    readHandshakeData(): Buffer;
    readEarlyData(): Buffer;

    // client-side
    getClientInitial(): Buffer;
    isEarlyDataAllowed(): boolean;
    writeHandshakeData(buffer: Buffer): number;
    writeEarlyData(buffer: Buffer): number;
    readSSL(): Buffer; // VERIFY TODO: not really an idea why this is needed... is only called at the end of the handshake flow, just reads from the socket with SSL_read_ex but data is never used... if really just enables NewSessionTicket, then rename this method  

    // both sides
    setTransportParameters(buffer: Buffer): void;
    getTransportParameters(): Buffer;

    on(event: string, callback: Function): void;

    exportKeyingMaterial(buffer: Buffer, hashsize: number): Buffer;
    exportEarlyKeyingMaterial(buffer: Buffer, hashsize: number): Buffer;
    getNegotiatedCipher(): string;

    getSession(): Buffer;
    setSession(buffer: Buffer): void;
    isSessionReused(): boolean;
}
import {createHash, createCipheriv} from "crypto";
import { ConnectionErrorCodes } from "../utilities/errors/quic.codes";
import { QuicError } from "./../utilities/errors/connection.error";

export class Cipher {
    private cipher: string;

    public constructor(cipher: string) {
        // Just to be sure to be compatible
        this.cipher = cipher.split('-').join('_');
    }

    public getHash(): string {
        switch(this.cipher) {
            case "TLS_AES_128_GCM_SHA256":
            case "TLS_CHACHA20_POLY1305_SHA256":
                return "sha256";
            case "TLS_AES_256_GCM_SHA384":
                return "sha384";
        }
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported hash function: " + this.cipher);
    }

    public getHashLength(): number {
        return createHash(this.getHash()).digest().length;
    }

    public getAEAD(): string {
        switch(this.cipher) {
            case "TLS_AES_128_GCM_SHA256":
                return "aes-128-gcm";
            case "TLS_CHACHA20_POLY1305_SHA256":
                return "chacha20-poly1305";
            case "TLS_AES_256_GCM_SHA384":
                return "aes-256-gcm";
        }
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported aead function: " + this.cipher);

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
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported aead function: " + this.cipher);
    }
}
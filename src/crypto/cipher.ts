import {createHash, createCipheriv} from "crypto";
import { ConnectionErrorCodes } from "../utilities/errors/quic.codes";
import { QuicError } from "./../utilities/errors/connection.error";

// FIXME: TODO: add support for CCM ciphers (now we only do GCM)
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

    /**
     * Get encryption algorithm for gcm mode (used by packet encryption)
     */
    public getAeadGcm(): string {
        switch(this.cipher) {
            case "TLS_AES_128_GCM_SHA256":
                return "aes-128-gcm";
            case "TLS_AES_256_GCM_SHA384":
                return "aes-256-gcm";
            case "TLS_CHACHA20_POLY1305_SHA256":
                return "chacha20-poly1305";
        }
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported aead function: " + this.cipher);
    }

    public getAeadEcb():string{
        switch(this.cipher) {
            case "TLS_AES_128_GCM_SHA256":
                return "aes-128-ecb";
            case "TLS_AES_256_GCM_SHA384":
                return "aes-256-ecb";
            case "TLS_CHACHA20_POLY1305_SHA256":
                return "chacha20-poly1305";
        }
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported aead function: " + this.cipher);
    }

    /**
     * Get encryption algorithm for counter mode (used by packet number encryption)
     */
    /*
    public getAeadCtr(): string {
        switch(this.cipher) {
            case "TLS_AES_128_GCM_SHA256":
                return "aes-128-ctr";
            case "TLS_CHACHA20_POLY1305_SHA256":
                return "chacha20"; // Still needs to be tested
            case "TLS_AES_256_GCM_SHA384":
                return "aes-256-ctr";
        }
        throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "Unsupported aead function: " + this.cipher);
    }
    */

    /**
     * Get length of the key that is needed for the chosen algorithm
     */
    public getAeadKeyLength(): number {
        var aead = this.getAeadGcm();
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
import {createHash, createCipheriv} from "crypto";

export class Cipher {
    private cipher: string;

    public constructor(cipher: string) {
        this.cipher = cipher;
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
}
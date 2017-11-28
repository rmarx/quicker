import { Hmac, createHmac, createHash } from "crypto";

/**
 * Implementation of HMAC-based Extract-and-Expand Key Derivation Function (HKDF) RFC-5869
 */
export class HKDF {

    private algorithm: string;
    private hashLength: number;

    public constructor(algorithm: string) {
        this.algorithm = algorithm;
        // HashLen denotes the length of the hash function output in octets 
        this.hashLength = createHash(algorithm).digest().length;
    }

    public extract(salt: Buffer, ikm: Buffer): Buffer {
        var hmac = createHmac(this.algorithm, salt);
        hmac.update(ikm);
        return hmac.digest();
    }

    public expand(prk: Buffer, info: Buffer, lengthOutput: number): Buffer {
        var n: number = Math.ceil(lengthOutput / this.hashLength);
        var prevBuffer = new Buffer(0);
        var output = new Buffer(n * this.hashLength);
        var retBuffer = new Buffer(lengthOutput);
        var infoLength = info.toString().length;

        for(var i = 0; i < n; i++) {
            var hmac = createHmac(this.algorithm, prk);
            var buf = Buffer.concat([prevBuffer, info, Buffer.from([i + 1])], infoLength + 1 + (i === 0 ? 0 : this.hashLength));
            hmac.update(buf);
            prevBuffer = hmac.digest();
            prevBuffer.copy(output, i * this.hashLength);
        }

        output.copy(retBuffer, 0, 0, lengthOutput);
        return retBuffer;
    }

    public expandLabel(prk: Buffer, label: string, hashValue: string, lengthOutput: number): Buffer {
        label = "tls13 " + label;
        var length = Buffer.from([lengthOutput / 256, lengthOutput % 256]);
        var bufLabel = Buffer.from(label);
        var hashLength = Buffer.from([hashValue.length]);
        var hkdfLabel = Buffer.concat([length, Buffer.from([label.length]), bufLabel, hashLength]);
        return this.expand(prk, hkdfLabel, lengthOutput);
    }
}
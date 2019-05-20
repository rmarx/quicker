import {Constants} from '../utilities/constants';
import { Hmac, createHmac, createHash } from "crypto";
import { VerboseLogging } from '../utilities/logging/verbose.logging';

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

    /**
     * Extract method from RFC-5869
     * @param salt 
     * @param ikm 
     */
    public extract(salt: Buffer, ikm: Buffer): Buffer {
        var hmac = createHmac(this.algorithm, salt);
        hmac.update(ikm);
        return hmac.digest();
    }

    /**
     * Expand method from RFC-5869
     * @param prk 
     * @param info 
     * @param lengthOutput 
     */
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

    /**
     * ExpandLabel function from TLS 1.3 RFC (still in draft at the time of writing)
     * @param prk 
     * @param label 
     * @param hashValue 
     * @param hashLength 
     */
    /*
    public expandLabel(prk: Buffer, label: string, hashValue: string, lengthOutput: number): Buffer {
        label = Constants.QHKDF_BASE_LABEL + label;
        var length = Buffer.from([lengthOutput / 256, lengthOutput % 256]);
        var bufLabel = Buffer.from(label);
        var hashLength = Buffer.from([hashValue.length]);
        var hkdfLabel = Buffer.concat([length, Buffer.from([label.length]), bufLabel, hashLength]);
        return this.expand(prk, hkdfLabel, lengthOutput);
    }
    */


    public qhkdfExpandLabel(prk: Buffer, label: string, hashLength: number): Buffer {

        label = "tls13 " + label; // yes, the label will be "tls13 quic hp" and similar, this is intentional

        let hashLengthBuffer = Buffer.from([hashLength]);
        if( hashLengthBuffer.byteLength == 1 ) // we need to have a uint16, so prepend 0
            hashLengthBuffer = Buffer.concat( [Buffer.from([0]), hashLengthBuffer] );

        let labelBuffer = Buffer.from(label);

        // for more details, see https://tools.ietf.org/html/rfc8446#section-7.1
        /*
            // we are recreating this setup here:
            struct {
                uint16 length = Length;
                opaque label<7..255> = "tls13 " + Label; // opaque values are prefixed with their length
                opaque context<0..255> = Context; // opaque values are prefixd with length. here, the context is empty string, so the length is 0, but it still needs to be encoded
            } HkdfLabel;
        */
        let hkdfLabel = Buffer.concat([hashLengthBuffer, Buffer.from([label.length]), labelBuffer, Buffer.from([0])]);

        VerboseLogging.info("qhkdfExpandLabel: label from " + label + " // " + hkdfLabel.toString('hex') );
        return this.expand(prk, hkdfLabel, hashLength);
    }
}
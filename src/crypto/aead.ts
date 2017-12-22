import {Bignum} from '../utilities/bignum';
import {ConnectionID, PacketNumber, BaseHeader} from '../packet/header/base.header';
import {HKDF} from './hkdf';
import {Constants} from '../utilities/constants';
import {EndpointType} from '../quicker/type';
import { createCipheriv, createDecipheriv } from "crypto";


export class AEAD {
    
    /**
     * Method to encrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param payload Payload that needs to be send
     * @param encryptingEndpoint the encrypting endpoint
     */
    public clearTextEncrypt(clientConnectionId: ConnectionID, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var clearTextSecret = this.getClearTextSecret(hkdf, clientConnectionId, encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, "key" , "", 16);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", 12);
        var nonce = this.calculateNonce(iv, header.getPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        console.log("Key: " + key.toString('hex'));
        console.log("IV: " + iv.toString('hex'));
        console.log("nonce: " + nonce.toString('hex'));
        console.log("AD: " + ad.toString('hex'));
        return this._encrypt(Constants.DEFAULT_AEAD, key, nonce, ad, payload);
    }
    /**
     * Method to decrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param encryptedPayload Payload that needs to be decrypted
     * @param encryptingEndpoint The endpoint that encrypted the payload
     */
    public clearTextDecrypt(clientConnectionId: ConnectionID, header: BaseHeader, encryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var clearTextSecret = this.getClearTextSecret(hkdf, clientConnectionId, encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, "key" , "", 16);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", 12);
        var nonce = this.calculateNonce(iv, header.getPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._decrypt(Constants.DEFAULT_AEAD, key, nonce, ad, encryptedPayload);
    }

    /**
     * Method to get the cleartext secret.
     * @param hkdf 
     * @param connectionID ConnectionID from the connection
     * @param encryptingEndpoint The endpoint that encrypts/encrypted the payload
     */
    private getClearTextSecret(hkdf: HKDF, connectionID: ConnectionID, encryptingEndpoint: EndpointType): any {
        var quicVersionSalt = Buffer.from(Constants.getVersionSalt(Constants.getActiveVersion()),'hex');
        var clearTextSecret = hkdf.extract(quicVersionSalt, connectionID.toBuffer())
        var label = "QUIC client handshake secret";
        if(encryptingEndpoint === EndpointType.Server) {
            label = "QUIC server handshake secret";
        }
        return hkdf.expandLabel(clearTextSecret, label , "", 32);
    }

    /**
     * The actual method that encrypt the payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param iv 
     * @param payload 
     */
    private _encrypt(algorithm: string, key: Buffer, nonce: Buffer,ad:Buffer, payload: Buffer) {
        var cipher = createCipheriv(algorithm, key, nonce);
        cipher.setAAD(ad);
        var update: Buffer = cipher.update(payload);
        var final: Buffer = cipher.final();
        var authTag = cipher.getAuthTag();
        console.log("tag: " + authTag.toString('hex'));
        return Buffer.concat([update, final, authTag]);
    }

    /**
     * The actual method that decrypts the encrypted payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param iv 
     * @param encryptedPayload 
     */
    private _decrypt(algorithm: string, key: Buffer, nonce: Buffer,ad: Buffer, encryptedPayload: Buffer) {
        var cipher = createDecipheriv(algorithm, key, nonce);
        cipher.setAAD(ad);
        var authTag = encryptedPayload.slice(encryptedPayload.length - 16, encryptedPayload.length);
        var encPayload = encryptedPayload.slice(0, encryptedPayload.length - 16);
        cipher.setAuthTag(authTag);
        var update: Buffer = cipher.update(encPayload);
        var final: Buffer = cipher.final();
        return Buffer.concat([update, final]);
    }

    private calculateNonce(iv: Buffer, packetNumber: PacketNumber): Bignum {
        var pnb = packetNumber.getPacketNumber();
        var ivb = new Bignum(iv, iv.byteLength);
        ivb.xor(pnb);
        return ivb;
    }

    private calculateAssociatedData(header: BaseHeader) {
        return header.toBuffer();
    }
}
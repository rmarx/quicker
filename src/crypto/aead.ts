import { ConnectionID } from "../packet/header/base.header";
import { HKDF } from "./hkdf";
import { Constants } from "../utilities/constants";
import { EndpointType } from "../quicker/type";
import { createCipheriv, createDecipheriv } from "crypto";


export class AEAD {
    
    /**
     * Method to encrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param payload Payload that needs to be send
     * @param encryptingEndpoint the encrypting endpoint
     */
    public clearTextEncrypt(connectionID: ConnectionID, payload: Buffer, encryptingEndpoint: EndpointType) {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var clearTextSecret = this.getClearTextSecret(hkdf, connectionID, encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, "key" , "", 16);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", 12);
        return this._encrypt(Constants.DEFAULT_AEAD, key, iv, payload);
    }

    /**
     * Method to decrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param encryptedPayload Payload that needs to be decrypted
     * @param encryptingEndpoint The endpoint that encrypted the payload
     */
    public clearTextDecrypt(connectionID: ConnectionID, encryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        var hkdf = new HKDF("sha256");
        var clearTextSecret = this.getClearTextSecret(hkdf, connectionID, encryptingEndpoint);

        var key = hkdf.expandLabel(clearTextSecret, "key" , "", 16);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", 12);
        return this._decrypt(Constants.DEFAULT_AEAD, key, iv, encryptedPayload);
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
        var label = "QUIC client cleartext Secret";
        if(encryptingEndpoint === EndpointType.Server) {
            label = "QUIC server cleartext Secret";
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
    private _encrypt(algorithm: string, key: Buffer, iv: Buffer, payload: Buffer) {
        var cipher = createCipheriv(algorithm, key, iv);
        var update: Buffer = cipher.update(payload);
        var final: Buffer = cipher.final();
        return Buffer.concat([update, final, cipher.getAuthTag()]);
    }

    /**
     * The actual method that decrypts the encrypted payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param iv 
     * @param encryptedPayload 
     */
    private _decrypt(algorithm: string, key: Buffer, iv: Buffer, encryptedPayload: Buffer) {
        var cipher = createDecipheriv(algorithm, key, iv);
        var authTag = encryptedPayload.slice(encryptedPayload.length - 16, encryptedPayload.length);
        var encPayload = encryptedPayload.slice(0, encryptedPayload.length - 16);
        cipher.setAuthTag(authTag);
        var update: Buffer = cipher.update(encPayload);
        var final: Buffer = cipher.final();
        return Buffer.concat([update, final]);
    }
}
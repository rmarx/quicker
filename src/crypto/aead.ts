import { ConnectionID } from "../packet/header/base.header";
import { HKDF } from "./hkdf";
import { Constants } from "../helpers/constants";
import { EndpointType } from "../quicker/type";
import { createCipheriv, createDecipheriv } from "crypto";


export class AEAD {

    private readonly algorithm = "aes-128-gcm";
    
    public clearTextEncrypt(connectionID: ConnectionID, payload: Buffer, encryptingEndpoint: EndpointType) {
        var hkdf = new HKDF("sha256");
        var clearTextSecret = this.getClearTextSecret(hkdf, connectionID, encryptingEndpoint);

        var key = hkdf.expandLabel(clearTextSecret, "key" , "", 16);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", 12);
        return this._encrypt(this.algorithm, key, iv, payload);
    }

    public clearTextDecrypt(connectionID: ConnectionID, encryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        var hkdf = new HKDF("sha256");
        var clearTextSecret = this.getClearTextSecret(hkdf, connectionID, encryptingEndpoint);

        var key = hkdf.expandLabel(clearTextSecret, "key" , "", 16);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", 12);
        return this._decrypt(this.algorithm, key, iv, encryptedPayload);
    }


    private getClearTextSecret(hkdf: HKDF, connectionID: ConnectionID, encryptingEndpoint: EndpointType): any {
        var quicVersionSalt = Buffer.from(Constants.getVersionSalt(Constants.getActiveVersion()),'hex');
        var clearTextSecret = hkdf.extract(quicVersionSalt, connectionID.getConnectionID())
        var label = "QUIC client cleartext Secret";
        if(encryptingEndpoint === EndpointType.Server) {
            label = "QUIC server cleartext Secret";
        }
        return hkdf.expandLabel(clearTextSecret, label , "", 32);
    }
    private _encrypt(algorithm: string, key: Buffer, iv: Buffer, payload: Buffer) {
        var cipher = createCipheriv(algorithm, key, iv);
        var update: Buffer = cipher.update(payload);
        var final: Buffer = cipher.final();
        console.log("authtag:" + cipher.getAuthTag().toString('hex'));
        return Buffer.concat([update, final, cipher.getAuthTag()]);
    }

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
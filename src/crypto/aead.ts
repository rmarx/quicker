import {QTLS} from './qtls';
import {Connection} from '../quicker/connection';
import {Bignum} from '../utilities/bignum';
import {ConnectionID, BaseHeader, PacketNumber} from '../packet/header/base.header';
import {HKDF} from './hkdf';
import {Constants} from '../utilities/constants';
import {EndpointType} from '../quicker/type';
import { createCipheriv, createDecipheriv } from "crypto";


export class AEAD {

    private protected1RTTClientSecret: Buffer;
    private protected1RTTServerSecret: Buffer;
    
    /**
     * Method to encrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param payload Payload that needs to be send
     * @param encryptingEndpoint the encrypting endpoint
     */
    public clearTextEncrypt(clientConnectionId: ConnectionID, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var clearTextSecret = this.getClearTextSecret(hkdf, clientConnectionId, encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, "key" , "", Constants.DEFAULT_AEAD_LENGTH);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", Constants.IV_LENGTH);
        var nonce = this.calculateNonce(iv, header.getPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._encrypt(Constants.DEFAULT_AEAD, key, nonce, ad, payload);
    }
    /**
     * Method to decrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param encryptedPayload Payload that needs to be decrypted
     * @param encryptingEndpoint The endpoint that encrypted the payload
     */
    public clearTextDecrypt(clientConnectionId: ConnectionID, header: BaseHeader, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var clearTextSecret = this.getClearTextSecret(hkdf, clientConnectionId, encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, "key" , "", Constants.DEFAULT_AEAD_LENGTH);
        var iv = hkdf.expandLabel(clearTextSecret, "iv" , "", Constants.IV_LENGTH);
        var nonce = this.calculateNonce(iv, header.getPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._decrypt(Constants.DEFAULT_AEAD, key, nonce, ad, encryptedPayload);
    }

    public protected1RTTEncrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var hkdf = new HKDF(connection.getQuicTLS().getHash());
        if (encryptingEndpoint === EndpointType.Client) {
            var key = hkdf.expandLabel(this.protected1RTTClientSecret, "key" , "", connection.getQuicTLS().getAEADKeyLength());
            var iv = hkdf.expandLabel(this.protected1RTTClientSecret, "iv" , "", Constants.IV_LENGTH);
        } else {
            var key = hkdf.expandLabel(this.protected1RTTServerSecret, "key" , "", connection.getQuicTLS().getAEADKeyLength());
            var iv = hkdf.expandLabel(this.protected1RTTServerSecret, "iv" , "", Constants.IV_LENGTH);
        }
        var nonce = this.calculateNonce(iv, header.getPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._encrypt(connection.getQuicTLS().getAEAD(), key, nonce, ad, payload);
    }

    public protected1RTTDecrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var hkdf = new HKDF(connection.getQuicTLS().getHash());
        if (encryptingEndpoint === EndpointType.Client) {
            var key = hkdf.expandLabel(this.protected1RTTClientSecret, "key" , "", connection.getQuicTLS().getAEADKeyLength());
            var iv = hkdf.expandLabel(this.protected1RTTClientSecret, "iv" , "", Constants.IV_LENGTH);
        } else {
            var key = hkdf.expandLabel(this.protected1RTTServerSecret, "key" , "", connection.getQuicTLS().getAEADKeyLength());
            var iv = hkdf.expandLabel(this.protected1RTTServerSecret, "iv" , "", Constants.IV_LENGTH);
        }
        var nonce = this.calculateNonce(iv, header.getPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._decrypt(connection.getQuicTLS().getAEAD(), key, nonce, ad, payload);
    }

    public generateProtected1RTTSecrets(qtls: QTLS): void {
        this.protected1RTTClientSecret = qtls.exportKeyingMaterial("EXPORTER-QUIC client 1-RTT Secret");
        this.protected1RTTServerSecret = qtls.exportKeyingMaterial("EXPORTER-QUIC server 1-RTT Secret");
    }

    public updateProtected1RTTSecret(qtls: QTLS): void {
        var hkdf = new HKDF(qtls.getHash());
        this.protected1RTTClientSecret = hkdf.expandLabel(this.protected1RTTClientSecret, "QUIC client 1-RTT Secret" , "", qtls.getHashLength());
        this.protected1RTTServerSecret = hkdf.expandLabel(this.protected1RTTClientSecret, "QUIC server 1-RTT Secret" , "", qtls.getHashLength());
    }

    /**
     * Method to get the cleartext secret.
     * @param hkdf 
     * @param connectionID ConnectionID from the connection
     * @param encryptingEndpoint The endpoint that encrypts/encrypted the payload
     */
    private getClearTextSecret(hkdf: HKDF, connectionID: ConnectionID, encryptingEndpoint: EndpointType): Buffer {
        var quicVersionSalt = Buffer.from(Constants.getVersionSalt(Constants.getActiveVersion()),'hex');
        var clearTextSecret = hkdf.extract(quicVersionSalt, connectionID.toBuffer())
        var label = "QUIC client handshake secret";
        if(encryptingEndpoint === EndpointType.Server) {
            label = "QUIC server handshake secret";
        }
        return hkdf.expandLabel(clearTextSecret, label , "", Constants.DEFAULT_HASH_SIZE);
    }

    /**
     * The actual method that encrypt the payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param iv 
     * @param payload 
     */
    private _encrypt(algorithm: string, key: Buffer, nonce: Buffer,ad:Buffer, payload: Buffer): Buffer {
        var cipher = createCipheriv(algorithm, key, nonce);
        cipher.setAAD(ad);
        var update: Buffer = cipher.update(payload);
        var final: Buffer = cipher.final();
        var authTag = cipher.getAuthTag();
        return Buffer.concat([update, final, authTag]);
    }

    /**
     * The actual method that decrypts the encrypted payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param iv 
     * @param encryptedPayload 
     */
    private _decrypt(algorithm: string, key: Buffer, nonce: Buffer,ad: Buffer, encryptedPayload: Buffer): Buffer {
        var cipher = createDecipheriv(algorithm, key, nonce);
        cipher.setAAD(ad);
        var authTag = encryptedPayload.slice(encryptedPayload.length - Constants.TAG_LENGTH, encryptedPayload.length);
        var encPayload = encryptedPayload.slice(0, encryptedPayload.length - Constants.TAG_LENGTH);
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

    private calculateAssociatedData(header: BaseHeader): Buffer {
        return header.toBuffer();
    }
}
import {ConnectionID, Version, PacketNumber} from '../types/header.properties';
import {QTLS, QuicTLSEvents} from './qtls';
import {Connection} from '../types/connection';
import {Bignum} from '../types/bignum';
import {BaseHeader} from '../packet/header/base.header';
import {HKDF} from './hkdf';
import {Constants} from '../utilities/constants';
import {EndpointType} from '../types/endpoint.type';
import { createCipheriv, createDecipheriv } from "crypto";
import { logMethod } from '../utilities/decorators/log.decorator';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { LongHeader } from '../packet/header/long.header';

export class AEAD {

    private qtls: QTLS;

    // Client earlyData secret
    private protected0RTTClientSecret!: Buffer;
    // Client secret
    private protected1RTTClientSecret!: Buffer;
    // Server secret
    private protected1RTTServerSecret!: Buffer;

    // Early data key and iv
    private protected0RTTKey!: Buffer;
    private protected0RTTIv!: Buffer;
    // Client key and iv
    private protected1RTTClientKey!: Buffer;
    private protected1RTTClientIv!: Buffer;
    // Server key and iv
    private protected1RTTServerKey!: Buffer;
    private protected1RTTServerIv!: Buffer;

    public constructor(qtls: QTLS) {
        this.qtls = qtls;
        this.qtls.on(QuicTLSEvents.EARLY_DATA_ALLOWED, () => {
            if (this.protected0RTTClientSecret === undefined) {
                this.generateProtected0RTTSecrets(this.qtls);
            }
        });
    }

    /**
     * Method to encrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param payload Payload that needs to be send
     * @param encryptingEndpoint the encrypting endpoint
     */
    public clearTextEncrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var longHeader = <LongHeader> header;
        var clearTextSecret = this.getClearTextSecret(hkdf, connection.getFirstConnectionID(), longHeader.getVersion(), encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, Constants.PACKET_PROTECTION_KEY_LABEL, "", Constants.DEFAULT_AEAD_LENGTH);
        var iv = hkdf.expandLabel(clearTextSecret, Constants.PACKET_PROTECTION_IV_LABEL, "", Constants.IV_LENGTH);
        var nonce = this.calculateNonce(header, iv, connection.getLocalPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._encrypt(Constants.DEFAULT_AEAD, key, nonce, ad, payload);
    }
    /**
     * Method to decrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param encryptedPayload Payload that needs to be decrypted
     * @param encryptingEndpoint The endpoint that encrypted the payload
     */
    public clearTextDecrypt(connection: Connection, header: BaseHeader, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var hkdf = new HKDF(Constants.DEFAULT_HASH);
        var longHeader = <LongHeader> header;
        var clearTextSecret = this.getClearTextSecret(hkdf, connection.getFirstConnectionID(), longHeader.getVersion(), encryptingEndpoint);
        var key = hkdf.expandLabel(clearTextSecret, Constants.PACKET_PROTECTION_KEY_LABEL, "", Constants.DEFAULT_AEAD_LENGTH);
        var iv = hkdf.expandLabel(clearTextSecret, Constants.PACKET_PROTECTION_IV_LABEL, "", Constants.IV_LENGTH);
        var nonce = this.calculateNonce(header, iv, connection.getRemotePacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._decrypt(Constants.DEFAULT_AEAD, key, nonce, ad, encryptedPayload);
    }

    public protected1RTTEncrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected1RTTClientSecret === undefined ||  this.protected1RTTServerSecret === undefined) {
            this.generateProtected1RTTSecrets(connection.getQuicTLS());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.protected1RTTClientKey;
            var iv = this.protected1RTTClientIv;
        } else {
            var key = this.protected1RTTServerKey;
            var iv = this.protected1RTTServerIv;
        }
        var nonce = this.calculateNonce(header, iv, connection.getLocalPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._encrypt(connection.getQuicTLS().getCipher().getAEAD(), key, nonce, ad, payload);
    }

    public protected1RTTDecrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected1RTTClientSecret === undefined ||  this.protected1RTTServerSecret === undefined) {
            this.generateProtected1RTTSecrets(connection.getQuicTLS());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.protected1RTTClientKey;
            var iv = this.protected1RTTClientIv;
        } else {
            var key = this.protected1RTTServerKey;
            var iv = this.protected1RTTServerIv;
        }
        var nonce = this.calculateNonce(header, iv, connection.getRemotePacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._decrypt(connection.getQuicTLS().getCipher().getAEAD(), key, nonce, ad, payload);
    }

    public protected0RTTEncrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            // TODO: replace with error, when in this if test, 0-RTT is probably not available
            this.generateProtected0RTTSecrets(this.qtls);
        }
        var key = this.protected0RTTKey;
        var iv = this.protected0RTTIv;
        var nonce = this.calculateNonce(header, iv, connection.getLocalPacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._encrypt(connection.getQuicTLS().getCipher().getAEAD(), key, nonce, ad, payload);
    }

    public protected0RTTDecrypt(connection: Connection, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }

        var key = this.protected0RTTKey;
        var iv = this.protected0RTTIv;
        var nonce = this.calculateNonce(header, iv, connection.getRemotePacketNumber()).toBuffer();
        var ad = this.calculateAssociatedData(header);
        return this._decrypt(connection.getQuicTLS().getCipher().getAEAD(), key, nonce, ad, payload);
    }

    private generateProtected1RTTSecrets(qtls: QTLS): void {
        var hkdf = new HKDF(qtls.getCipher().getHash());
        this.protected1RTTClientSecret = qtls.exportKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.CLIENT_1RTT_LABEL);
        this.protected1RTTServerSecret = qtls.exportKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.SERVER_1RTT_LABEL);
        this.generateKeyAndIv(qtls);
    }

    private generateProtected0RTTSecrets(qtls: QTLS): void {
        var hkdf = new HKDF(qtls.getCipher().getHash());
        this.protected0RTTClientSecret = qtls.exportEarlyKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.CLIENT_0RTT_LABEL);
        this.protected0RTTKey = hkdf.expandLabel(this.protected0RTTClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, "", qtls.getCipher().getAEADKeyLength());
        this.protected0RTTIv = hkdf.expandLabel(this.protected0RTTClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, "", Constants.IV_LENGTH);
    }

    public updateProtected1RTTSecret(qtls: QTLS): void {
        var hkdf = new HKDF(qtls.getCipher().getHash());
        this.protected1RTTClientSecret = hkdf.expandLabel(this.protected1RTTClientSecret, Constants.CLIENT_1RTT_LABEL, "", qtls.getCipher().getHashLength());
        this.protected1RTTServerSecret = hkdf.expandLabel(this.protected1RTTClientSecret, Constants.SERVER_1RTT_LABEL, "", qtls.getCipher().getHashLength());
        this.generateKeyAndIv(qtls);
    }

    private generateKeyAndIv(qtls: QTLS) {
        var hkdf = new HKDF(qtls.getCipher().getHash());
        // Generate Client key and IV
        this.protected1RTTClientKey = hkdf.expandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, "", qtls.getCipher().getAEADKeyLength());
        this.protected1RTTClientIv = hkdf.expandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, "", Constants.IV_LENGTH);
        // Generate Server key and IV
        this.protected1RTTServerKey = hkdf.expandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_KEY_LABEL, "", qtls.getCipher().getAEADKeyLength());
        this.protected1RTTServerIv = hkdf.expandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_IV_LABEL, "", Constants.IV_LENGTH);
    }

    /**
     * Method to get the cleartext secret.
     * @param hkdf 
     * @param connectionID ConnectionID from the connection
     * @param encryptingEndpoint The endpoint that encrypts/encrypted the payload
     */
    private getClearTextSecret(hkdf: HKDF, connectionID: ConnectionID, version: Version, encryptingEndpoint: EndpointType): Buffer {
        var quicVersionSalt = Buffer.from(Constants.getVersionSalt(version.toString()), 'hex');
        var clearTextSecret = hkdf.extract(quicVersionSalt, connectionID.toBuffer())
        var label = Constants.CLIENT_HANDSHAKE_LABEL;
        if (encryptingEndpoint === EndpointType.Server) {
            label = Constants.SERVER_HANDSHAKE_LABEL;
        }
        return hkdf.expandLabel(clearTextSecret, label, "", Constants.DEFAULT_HASH_SIZE);
    }

    /**
     * The actual method that encrypt the payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param iv 
     * @param payload 
     */
    private _encrypt(algorithm: string, key: Buffer, nonce: Buffer, ad: Buffer, payload: Buffer): Buffer {
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
    private _decrypt(algorithm: string, key: Buffer, nonce: Buffer, ad: Buffer, encryptedPayload: Buffer): Buffer {
        var cipher = createDecipheriv(algorithm, key, nonce);
        cipher.setAAD(ad);
        var authTag = encryptedPayload.slice(encryptedPayload.length - Constants.TAG_LENGTH, encryptedPayload.length);
        var encPayload = encryptedPayload.slice(0, encryptedPayload.length - Constants.TAG_LENGTH);
        cipher.setAuthTag(authTag);
        var update: Buffer = cipher.update(encPayload);
        var final: Buffer = cipher.final();
        return Buffer.concat([update, final]);
    }

    private calculateNonce(header: BaseHeader, iv: Buffer, packetNumber: PacketNumber): Bignum {
        var pnb = packetNumber.getAdjustedNumber(header.getPacketNumber(), header.getPacketNumberSize()).getPacketNumber();
        var ivb = new Bignum(iv, iv.byteLength);
        ivb = ivb.xor(pnb);
        return ivb;
    }

    private calculateAssociatedData(header: BaseHeader): Buffer {
        return header.toBuffer();
    }
}
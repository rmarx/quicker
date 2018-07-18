import { ConnectionID, Version, PacketNumber } from '../packet/header/header.properties';
import { QTLS, QuicTLSEvents } from './qtls';
import { Connection } from '../quicker/connection';
import { Bignum } from '../types/bignum';
import { BaseHeader, HeaderType } from '../packet/header/base.header';
import { HKDF } from './hkdf';
import { Constants } from '../utilities/constants';
import { EndpointType } from '../types/endpoint.type';
import { createCipheriv, createDecipheriv, createCipher, createDecipher } from "crypto";
import { logMethod } from '../utilities/decorators/log.decorator';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { LongHeader } from '../packet/header/long.header';
import { ShortHeader } from '../packet/header/short.header';
import { VLIE } from './vlie';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';

export class AEAD {

    private qtls: QTLS;

    // Version used to generate clear text secrets
    private usedVersion!: Version;

    // Client key and iv
    private clearTextClientKey!: Buffer;
    private clearTextClientIv!: Buffer;
    private clearTextClientPn!: Buffer;

    // Server key and iv
    private clearTextServerKey!: Buffer;
    private clearTextServerIv!: Buffer;
    private clearTextServerPn!: Buffer;

    // Client earlyData secret
    private protected0RTTClientSecret!: Buffer;
    // Client secret
    private protected1RTTClientSecret!: Buffer;
    // Server secret
    private protected1RTTServerSecret!: Buffer;

    // Early data key and iv
    private protected0RTTKey!: Buffer;
    private protected0RTTIv!: Buffer;
    private protected0RTTPn!: Buffer;

    // Client key and iv
    private protected1RTTClientKey!: Buffer;
    private protected1RTTClientIv!: Buffer;
    private protected1RTTClientPn!: Buffer;

    // Server key and iv
    private protected1RTTServerKey!: Buffer;
    private protected1RTTServerIv!: Buffer;
    private protected1RTTServerPn!: Buffer;

    private hkdfObjects: { [email: string]: HKDF; };

    public constructor(qtls: QTLS) {
        this.qtls = qtls;
        this.hkdfObjects = {};
        this.qtls.on(QuicTLSEvents.EARLY_DATA_ALLOWED, () => {
            if (this.protected0RTTClientSecret === undefined) {
                this.generateProtected0RTTSecrets();
            }
        });
    }

    /**
     * Method to encrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param payload Payload that needs to be send
     * @param encryptingEndpoint the encrypting endpoint
     */
    public clearTextEncrypt(connectionID: ConnectionID, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var longHeader = <LongHeader>header;
        if (this.usedVersion === undefined || this.usedVersion !== longHeader.getVersion()) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.clearTextClientKey;
            var iv = this.clearTextClientIv;
        } else {
            var key = this.clearTextServerKey;
            var iv = this.clearTextServerIv;
        }
        var nonce = this.calculateNonce(header, iv).toBuffer();
        return this._encrypt(Constants.DEFAULT_AEAD_GCM, key, nonce, header.toBuffer(), payload);
    }

    /**
     * Method to decrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param encryptedPayload Payload that needs to be decrypted
     * @param encryptingEndpoint The endpoint that encrypted the payload
     */
    public clearTextDecrypt(connectionID: ConnectionID, header: BaseHeader, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        var longHeader = <LongHeader>header;
        if (this.usedVersion === undefined || this.usedVersion !== longHeader.getVersion()) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.clearTextClientKey;
            var iv = this.clearTextClientIv;
        } else {
            var key = this.clearTextServerKey;
            var iv = this.clearTextServerIv;
        }
        var nonce = this.calculateNonce(header, iv).toBuffer();
        return this._decrypt(Constants.DEFAULT_AEAD_GCM, key, nonce, header.getParsedBuffer(), encryptedPayload);
    }

    public protected1RTTEncrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected1RTTClientSecret === undefined || this.protected1RTTServerSecret === undefined) {
            this.generateProtected1RTTSecrets();
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.protected1RTTClientKey;
            var iv = this.protected1RTTClientIv;
        } else {
            var key = this.protected1RTTServerKey;
            var iv = this.protected1RTTServerIv;
        }
        var nonce = this.calculateNonce(header, iv).toBuffer();
        return this._encrypt(this.qtls.getCipher().getAeadGcm(), key, nonce, header.toBuffer(), payload);
    }

    public protected1RTTDecrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected1RTTClientSecret === undefined || this.protected1RTTServerSecret === undefined) {
            this.generateProtected1RTTSecrets();
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.protected1RTTClientKey;
            var iv = this.protected1RTTClientIv;
        } else {
            var key = this.protected1RTTServerKey;
            var iv = this.protected1RTTServerIv;
        }
        var nonce = this.calculateNonce(header, iv).toBuffer();
        return this._decrypt(this.qtls.getCipher().getAeadGcm(), key, nonce, header.getParsedBuffer(), payload);
    }

    public protected0RTTEncrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            // TODO: replace with error, when in this if test, 0-RTT is probably not available
            this.generateProtected0RTTSecrets();
        }
        var key = this.protected0RTTKey;
        var iv = this.protected0RTTIv;
        var nonce = this.calculateNonce(header, iv).toBuffer();
        return this._encrypt(this.qtls.getCipher().getAeadGcm(), key, nonce, header.toBuffer(), payload);
    }

    public protected0RTTDecrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        var key = this.protected0RTTKey;
        var iv = this.protected0RTTIv;
        var nonce = this.calculateNonce(header, iv).toBuffer();
        return this._decrypt(this.qtls.getCipher().getAeadGcm(), key, nonce, header.getParsedBuffer(), payload);
    }

    public clearTextPnEncrypt(connectionID: ConnectionID,packetNumberBuffer: Buffer, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        var longHeader = <LongHeader>header;
        if (this.usedVersion === undefined || this.usedVersion !== longHeader.getVersion()) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.clearTextClientPn;
        } else {
            var key = this.clearTextServerPn;
        }
        return this._pnEncrypt(Constants.DEFAULT_AEAD_CTR, key, Constants.SAMPLE_LENGTH, packetNumberBuffer, header, payload);
    }

    public clearTextPnDecrypt(connectionID: ConnectionID,packetNumberBuffer: Buffer, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        var longHeader = <LongHeader>header;
        if (this.usedVersion === undefined || this.usedVersion !== longHeader.getVersion()) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.clearTextClientPn;
        } else {
            var key = this.clearTextServerPn;
        }
        return this._pnDecrypt(Constants.DEFAULT_AEAD_CTR, key, Constants.SAMPLE_LENGTH, packetNumberBuffer, header, payload);
    }

    public protected0RTTPnEncrypt(packetNumberBuffer: Buffer, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        if (this.protected0RTTClientSecret === undefined) {
            // TODO: replace with error, when in this if test, 0-RTT is probably not available
            this.generateProtected0RTTSecrets();
        }
        return this._pnEncrypt(this.qtls.getCipher().getAeadCtr(), this.protected0RTTPn, Constants.SAMPLE_LENGTH, packetNumberBuffer, header, payload);
    }

    public protected0RTTPnDecrypt(packetNumberBuffer: Buffer, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        if (this.protected0RTTClientSecret === undefined) {
            // TODO: replace with error, when in this if test, 0-RTT is probably not available
            this.generateProtected0RTTSecrets();
        }
        return this._pnDecrypt(this.qtls.getCipher().getAeadCtr(), this.protected0RTTPn, Constants.SAMPLE_LENGTH, packetNumberBuffer, header, payload);
    }

    public protected1RTTPnEncrypt(packetNumberBuffer: Buffer, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        if (this.protected1RTTClientSecret === undefined || this.protected1RTTServerSecret === undefined) {
            this.generateProtected1RTTSecrets();
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.protected1RTTClientPn;
        } else {
            var key = this.protected1RTTServerPn;
        }
        return this._pnEncrypt(this.qtls.getCipher().getAeadCtr(), key, Constants.SAMPLE_LENGTH, packetNumberBuffer, header, payload);
    }

    public protected1RTTPnDecrypt(packetNumberBuffer: Buffer, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType) {
        if (this.protected1RTTClientSecret === undefined || this.protected1RTTServerSecret === undefined) {
            this.generateProtected1RTTSecrets();
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.protected1RTTClientPn;
        } else {
            var key = this.protected1RTTServerPn;
        }
        return this._pnDecrypt(this.qtls.getCipher().getAeadCtr(), key, Constants.SAMPLE_LENGTH, packetNumberBuffer, header, payload);
    }

    private generateClearTextSecrets(connectionID: ConnectionID, qtls: QTLS, version: Version): void {
        var hkdf = this.getHKDFObject(Constants.DEFAULT_HASH);
        // Generate client key, IV, PN
        var clearTextClientSecret = this.getClearTextSecret(hkdf, connectionID, version, EndpointType.Client);
        this.clearTextClientKey = hkdf.qhkdfExpandLabel(clearTextClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        this.clearTextClientIv = hkdf.qhkdfExpandLabel(clearTextClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.clearTextClientPn = hkdf.qhkdfExpandLabel(clearTextClientSecret, Constants.PACKET_PROTECTION_PN_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        console.log("clear text client key: " + this.clearTextClientKey.toString('hex'));
        console.log("clear text client key: " + this.clearTextClientIv.toString('hex'));
        console.log("clear text client pn: " + this.clearTextClientPn.toString('hex'));

        // Generate server key, IV, PN
        var clearTextServerSecret = this.getClearTextSecret(hkdf, connectionID, version, EndpointType.Server);
        this.clearTextServerKey = hkdf.qhkdfExpandLabel(clearTextServerSecret, Constants.PACKET_PROTECTION_KEY_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        this.clearTextServerIv = hkdf.qhkdfExpandLabel(clearTextServerSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.clearTextServerPn = hkdf.qhkdfExpandLabel(clearTextServerSecret, Constants.PACKET_PROTECTION_PN_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        console.log("clear text server key: " + this.clearTextServerKey.toString('hex'));
        console.log("clear text server iv: " + this.clearTextServerIv.toString('hex'));
        console.log("clear text server pn: " + this.clearTextServerPn.toString('hex'));

        // Keep track of what version is used to generate these keys
        this.usedVersion = version;
    }

    private generateProtected1RTTSecrets(): void {
        var hkdf = this.getHKDFObject(this.qtls.getCipher().getHash());
        this.protected1RTTClientSecret = this.qtls.exportKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.CLIENT_1RTT_LABEL);
        this.protected1RTTServerSecret = this.qtls.exportKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.SERVER_1RTT_LABEL);
        this.generateKeyAndIv(hkdf, this.qtls);
    }

    private generateProtected0RTTSecrets(): void {
        var hkdf = this.getHKDFObject(this.qtls.getCipher().getHash());
        this.protected0RTTClientSecret = this.qtls.exportEarlyKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.CLIENT_0RTT_LABEL);
        this.protected0RTTKey = hkdf.qhkdfExpandLabel(this.protected0RTTClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, this.qtls.getCipher().getAeadKeyLength());
        this.protected0RTTIv = hkdf.qhkdfExpandLabel(this.protected0RTTClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.protected0RTTPn = hkdf.qhkdfExpandLabel(this.protected0RTTClientSecret, Constants.PACKET_PROTECTION_PN_LABEL, this.qtls.getCipher().getAeadKeyLength());
        console.log("protected0RTT client key: " + this.protected0RTTKey.toString('hex'));
        console.log("protected0RTT client iv: " + this.protected0RTTIv.toString('hex'));
        console.log("protected0RTT client pn: " + this.protected0RTTPn.toString('hex'));
    }

    public updateProtected1RTTSecret(): void {
        var hkdf = this.getHKDFObject(this.qtls.getCipher().getHash());
        this.protected1RTTClientSecret = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.CLIENT_1RTT_LABEL, this.qtls.getCipher().getHashLength());
        this.protected1RTTServerSecret = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.SERVER_1RTT_LABEL, this.qtls.getCipher().getHashLength());
        this.generateKeyAndIv(hkdf, this.qtls);
    }

    private generateKeyAndIv(hkdf: HKDF, qtls: QTLS) {
        // Generate Client key, IV, PN
        this.protected1RTTClientKey = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, qtls.getCipher().getAeadKeyLength());
        this.protected1RTTClientIv = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.protected1RTTClientPn = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_PN_LABEL, qtls.getCipher().getAeadKeyLength());
        console.log("protected1RTT client key: " + this.protected1RTTClientKey.toString('hex'));
        console.log("protected1RTT client iv: " + this.protected1RTTClientIv.toString('hex'));
        console.log("protected1RTT client pn: " + this.protected1RTTClientPn.toString('hex'));

        // Generate Server key, IV, PN
        this.protected1RTTServerKey = hkdf.qhkdfExpandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_KEY_LABEL, qtls.getCipher().getAeadKeyLength());
        this.protected1RTTServerIv = hkdf.qhkdfExpandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.protected1RTTServerPn = hkdf.qhkdfExpandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_PN_LABEL, qtls.getCipher().getAeadKeyLength());
        console.log("protected1RTT server key: " + this.protected1RTTServerKey.toString('hex'));
        console.log("protected1RTT server iv: " + this.protected1RTTServerIv.toString('hex'));
        console.log("protected1RTT server pn: " + this.protected1RTTServerPn.toString('hex'));
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
        return hkdf.qhkdfExpandLabel(clearTextSecret, label, Constants.DEFAULT_HASH_SIZE);
    }

    private calculateNonce(header: BaseHeader, iv: Buffer): Bignum {
        var pnb = header.getPacketNumber().getValue();
        var ivb = new Bignum(iv, iv.byteLength);
        ivb = ivb.xor(pnb);
        return ivb;
    }

    /**
     * The actual method that encrypt the payload, given the algorithm, key and iv
     * @param algorithm 
     * @param key 
     * @param nonce
     * @param ad 
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

    /**
     * Calculate the sampleoffset based on the header type
     * Used pseudocode from https://quicwg.org/base-drafts/draft-ietf-quic-tls.html#pn-encrypt
     */
    private getSampleOffset(sampleLength: number, header: BaseHeader, payloadLength: number): number {
        var sampleOffset: number = 0;
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var longHeader = <LongHeader>header;
            sampleOffset = 6 + longHeader.getDestConnectionID().getLength() + longHeader.getSrcConnectionID().getLength() + longHeader.getPayloadLengthBuffer().byteLength + 4;
        } else {
            var shortHeader = <ShortHeader>header;
            sampleOffset = 1 + shortHeader.getDestConnectionID().getLength() + 4;
        }
        // Check if sample does not exceed the payload
        if (sampleOffset + sampleLength > payloadLength) {
            sampleOffset = payloadLength - sampleLength;
        }
        // If sample offset is less than 0, throw an error because this is not possible
        if (sampleOffset < 0) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "sampleoffset is less than 0");
        }
        return sampleOffset;
    }

    private _pnEncrypt(algorithm: string, key: Buffer, sampleLength: number, packetNumberBuffer: Buffer, header: BaseHeader, encryptedPayload: Buffer): Buffer {
        var sampleOffset = this.getSampleOffset(sampleLength, header, encryptedPayload.byteLength);
        var sampleData = encryptedPayload.slice(sampleOffset, sampleOffset + sampleLength);
        var cipher = createCipheriv(algorithm, key, sampleData);
        var update = cipher.update(packetNumberBuffer);
        var final = cipher.final();
        return Buffer.concat([update, final]);
    }

    public _pnDecrypt(algorithm: string, key: Buffer, sampleLength: number, packetNumberBuffer: Buffer, header: BaseHeader, encryptedPayload: Buffer): Buffer {
        //console.log("used key: " + key.toString('hex'));
        //console.log("pnbuffer: " + packetNumberBuffer.toString('hex'));
        var sampleOffset = this.getSampleOffset(sampleLength, header, encryptedPayload.byteLength);
        var sampleData = encryptedPayload.slice(sampleOffset, sampleOffset + sampleLength);
        //console.log("sample data: " + sampleData.toString('hex'));
        var cipher = createDecipheriv(algorithm, key, sampleData);
        var update = cipher.update(packetNumberBuffer);
        var final = cipher.final();
        return Buffer.concat([update, final]);
    }

    private getHKDFObject(hash: string) {
        if (!(hash in this.hkdfObjects)) {
            this.hkdfObjects[hash] = new HKDF(hash);
        }
        return this.hkdfObjects[hash];
    }
}
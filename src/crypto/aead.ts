import { ConnectionID, Version, PacketNumber } from '../packet/header/header.properties';
import { QTLS, QuicTLSEvents } from './qtls';
import { Connection } from '../quicker/connection';
import { Bignum } from '../types/bignum';
import { BaseHeader, HeaderType } from '../packet/header/base.header';
import { BasePacket, PacketType } from '../packet/base.packet';
import { HKDF } from './hkdf';
import { Constants } from '../utilities/constants';
import { EndpointType } from '../types/endpoint.type';
import { createCipheriv, createDecipheriv } from "crypto";
import { logMethod } from '../utilities/decorators/log.decorator';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { LongHeader, LongHeaderType } from '../packet/header/long.header';
import { ShortHeader } from '../packet/header/short.header';
import { VLIE } from '../types/vlie';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { PartiallyParsedPacket } from '../utilities/parsers/header.parser';

export class AEAD {

    private qtls: QTLS;

    // Version used to generate clear text secrets
    private usedVersion!: Version;

    // Client key and iv
    private clearTextClientKey!: Buffer;
    private clearTextClientIv!: Buffer;
    private clearTextClientHp!: Buffer;

    // Server key and iv
    private clearTextServerKey!: Buffer;
    private clearTextServerIv!: Buffer;
    private clearTextServerHp!: Buffer;

    // Client earlyData secret
    private protected0RTTClientSecret!: Buffer;
    // Client handshake secret
    private protectedHandshakeClientSecret!:Buffer;
    // Server handshake secret
    private protectedHandshakeServerSecret!:Buffer;
    // Client secret
    private protected1RTTClientSecret!: Buffer;
    // Server secret
    private protected1RTTServerSecret!: Buffer;

    // Early data key and iv
    private protected0RTTKey!: Buffer;
    private protected0RTTIv!: Buffer;
    private protected0RTTHp!: Buffer;

    // Client handshake key and iv
    private protectedHandshakeClientKey!: Buffer;
    private protectedHandshakeClientIv!: Buffer;
    private protectedHandshakeClientHp!: Buffer;

    // Server handshake key and iv
    private protectedHandshakeServerKey!: Buffer;
    private protectedHandshakeServerIv!: Buffer;
    private protectedHandshakeServerHp!: Buffer;

    // Client key and iv
    private protected1RTTClientKey!: Buffer;
    private protected1RTTClientIv!: Buffer;
    private protected1RTTClientHp!: Buffer;

    // Server key and iv
    private protected1RTTServerKey!: Buffer;
    private protected1RTTServerIv!: Buffer;
    private protected1RTTServerHp!: Buffer;

    private hkdfObjects: { [email: string]: HKDF; };

    public constructor(qtls: QTLS) {
        this.qtls = qtls;
        this.hkdfObjects = {};
        /*
        this.qtls.on(QuicTLSEvents.EARLY_DATA_ALLOWED, () => {
            if (this.protected0RTTClientSecret === undefined) {
                this.generateProtected0RTTSecrets();
            }
        });
        */
    }

    public canClearTextEncrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.clearTextClientKey != undefined : this.clearTextServerKey != undefined; }
    public canClearTextDecrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.clearTextClientKey != undefined : this.clearTextServerKey != undefined; }

    public canHandshakeEncrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.protectedHandshakeClientKey != undefined : this.protectedHandshakeServerKey != undefined; }
    public canHandshakeDecrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.protectedHandshakeClientKey != undefined : this.protectedHandshakeServerKey != undefined; }
    
    public can1RTTEncrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.protected1RTTClientKey != undefined : this.protected1RTTServerKey != undefined; }
    public can1RTTDecrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.protected1RTTClientKey != undefined : this.protected1RTTServerKey != undefined; }

    public can0RTTEncrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.protected0RTTClientSecret != undefined : false; }
    public can0RTTDecrypt(encryptingEndpoint: EndpointType):boolean { return ( encryptingEndpoint == EndpointType.Client ) ? this.protected0RTTClientSecret != undefined : false; }
    

    /**
     * Method to encrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param payload Payload that needs to be send
     * @param encryptingEndpoint the encrypting endpoint
     */
    public clearTextEncrypt(connectionID: ConnectionID, header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        let key = undefined;
        let iv = undefined;

        let longHeader = <LongHeader>header;
        if (!longHeader.getVersion().equals( this.usedVersion)) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            key = this.clearTextClientKey;
            iv = this.clearTextClientIv;
        } else {
            key = this.clearTextServerKey;
            iv = this.clearTextServerIv;
        }

        let nonce = this.calculateNonce(header.getPacketNumber()!, iv).toBuffer();
        let encryptedPayload = this._encrypt(Constants.DEFAULT_AEAD_GCM, key, nonce, header.toUnencryptedBuffer(), payload);

        return encryptedPayload;
    }

    /**
     * Method to decrypt the payload (cleartext)
     * @param connectionID ConnectionID from the connection
     * @param encryptedPayload Payload that needs to be decrypted
     * @param encryptingEndpoint The endpoint that encrypted the payload
     */
    public clearTextDecrypt(connectionID: ConnectionID, version:Version, packetNumber:PacketNumber, unencryptedHeader:Buffer, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        let key = undefined;
        let iv = undefined;

        if (!version.equals( this.usedVersion )) {
            this.generateClearTextSecrets(connectionID, this.qtls, version);
        }
        if (encryptingEndpoint === EndpointType.Client) {
            key = this.clearTextClientKey;
            iv = this.clearTextClientIv;
        } else {
            key = this.clearTextServerKey;
            iv = this.clearTextServerIv;
        }


        let nonce = this.calculateNonce(packetNumber, iv).toBuffer();

        return this._decrypt(Constants.DEFAULT_AEAD_GCM, key, nonce, unencryptedHeader, encryptedPayload);
    }

    public protectedHandshakeEncrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        let key = undefined;
        let iv = undefined;

        if( encryptingEndpoint == EndpointType.Client){
            if( this.protectedHandshakeClientSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeEncrypt : client encryption secret not set!");
            else{
                key = this.protectedHandshakeClientKey;
                iv  = this.protectedHandshakeClientIv;
            }
        } else {
            if( this.protectedHandshakeServerSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeEncrypt : server encryption secret not set!");
            else{
                key = this.protectedHandshakeServerKey;
                iv  = this.protectedHandshakeServerIv;
            }
        }
        var nonce = this.calculateNonce(header.getPacketNumber()!, iv as Buffer).toBuffer();
        return this._encrypt(this.qtls.getCipher().getAeadGcm(), key as Buffer, nonce, header.toUnencryptedBuffer(), payload);
    }

    public protectedHandshakeDecrypt(packetNumber:PacketNumber, unencryptedHeader:Buffer, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        let key = undefined;
        let iv = undefined;

        if (encryptingEndpoint === EndpointType.Client) {
            if( this.protectedHandshakeClientSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeEncrypt : client decryption secret not set!");
            else{
                key = this.protectedHandshakeClientKey;
                iv  = this.protectedHandshakeClientIv;
            }
        } else {
            if( this.protectedHandshakeServerSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeEncrypt : server decryption secret not set!");
            else{
                key = this.protectedHandshakeServerKey;
                iv  = this.protectedHandshakeServerIv;
            }
        }
        var nonce = this.calculateNonce(packetNumber, iv as Buffer).toBuffer();
        return this._decrypt(this.qtls.getCipher().getAeadGcm(), key as Buffer, nonce, unencryptedHeader, encryptedPayload);
    }

    public protected1RTTEncrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        let key = undefined;
        let iv = undefined;

        if (encryptingEndpoint === EndpointType.Client) {
            if( this.protected1RTTClientSecret == undefined )
                VerboseLogging.error("aead:protected1RTTEncrypt : client encryption secret not set!");
            else{
                key = this.protected1RTTClientKey;
                iv = this.protected1RTTClientIv;
            }
        } else {
            if( this.protected1RTTServerSecret == undefined )
                VerboseLogging.error("aead:protected1RTTEncrypt : server encryption secret not set!");
            else{
                key = this.protected1RTTServerKey;
                iv = this.protected1RTTServerIv;
            }
        }
        var nonce = this.calculateNonce(header.getPacketNumber()!, iv as Buffer).toBuffer();
        return this._encrypt(this.qtls.getCipher().getAeadGcm(), key as Buffer, nonce, header.toUnencryptedBuffer(), payload);
    }

    public protected1RTTDecrypt(packetNumber:PacketNumber, unencryptedHeader:Buffer, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        let key = undefined;
        let iv = undefined;

        if (encryptingEndpoint === EndpointType.Client) {
            if( this.protected1RTTClientSecret == undefined )
                VerboseLogging.error("aead:protected1RTTDecrypt : client decryption secret not set!");
            else{
                key = this.protected1RTTClientKey;
                iv = this.protected1RTTClientIv;
            }
        } else {
            if( this.protected1RTTServerSecret == undefined )
                VerboseLogging.error("aead:protected1RTTDecrypt : server decryption secret not set!");
            else{
                key = this.protected1RTTServerKey;
                iv = this.protected1RTTServerIv;
            }
        }
        let nonce = this.calculateNonce(packetNumber, iv as Buffer).toBuffer();
        return this._decrypt(this.qtls.getCipher().getAeadGcm(), key as Buffer, nonce, unencryptedHeader, encryptedPayload);
    }

    public protected0RTTEncrypt(header: BaseHeader, payload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            VerboseLogging.error("aead:protected0RTTEncrypt : protected0RTTClientSecret not set, ignoring packet!");
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        var key = this.protected0RTTKey;
        var iv = this.protected0RTTIv;
        var nonce = this.calculateNonce(header.getPacketNumber()!, iv).toBuffer();
        return this._encrypt(this.qtls.getCipher().getAeadGcm(), key, nonce, header.toUnencryptedBuffer(), payload);
    }

    public protected0RTTDecrypt(packetNumber:PacketNumber, unencryptedHeader:Buffer, encryptedPayload: Buffer, encryptingEndpoint: EndpointType): Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            VerboseLogging.error("Aead:protected0RTTDecrypt : protected0RTTClientSecret not set, ignoring packet!");
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        var key = this.protected0RTTKey;
        var iv = this.protected0RTTIv;
        var nonce = this.calculateNonce(packetNumber, iv).toBuffer();
        return this._decrypt(this.qtls.getCipher().getAeadGcm(), key, nonce, unencryptedHeader, encryptedPayload);
    }

    public clearTextHeaderEncrypt(connectionID: ConnectionID, header: BaseHeader, headerAndEncryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        var longHeader = <LongHeader>header;
        if (!longHeader.getVersion().equals( this.usedVersion )) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.clearTextClientHp;
        } else {
            var key = this.clearTextServerHp;
        }
        return this._headerEncrypt(Constants.DEFAULT_AEAD_ECB, key, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public clearTextHeaderDecrypt(connectionID: ConnectionID, header: BaseHeader, headerAndEncryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        var longHeader = <LongHeader>header;
        if (!longHeader.getVersion().equals( this.usedVersion )) {
            this.generateClearTextSecrets(connectionID, this.qtls, longHeader.getVersion());
        }
        if (encryptingEndpoint === EndpointType.Client) {
            var key = this.clearTextClientHp;
        } else {
            var key = this.clearTextServerHp;
        }
        return this._headerDecrypt(Constants.DEFAULT_AEAD_ECB, key, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public protected0RTTHeaderEncrypt(header: BaseHeader, headerAndEncryptedPayload: Buffer) {
        if (this.protected0RTTClientSecret === undefined) {
            VerboseLogging.error("Aead:protected0RTTHeaderEncrypt : protected0RTTClientSecret not set, ignoring packet!");
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        return this._headerEncrypt(this.qtls.getCipher().getAeadEcb(), this.protected0RTTHp, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public protected0RTTHeaderDecrypt(header: BaseHeader, headerAndEncryptedPayload: Buffer):Buffer {
        if (this.protected0RTTClientSecret === undefined) {
            VerboseLogging.error("Aead:protected0RTTHeaderDecrypt : protected0RTTClientSecret not set, ignoring packet!");
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        return this._headerDecrypt(this.qtls.getCipher().getAeadEcb(), this.protected0RTTHp, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public protectedHandshakeHeaderEncrypt(header: BaseHeader, headerAndEncryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        let key = undefined;

        if (encryptingEndpoint === EndpointType.Client) {
            if( this.protectedHandshakeClientSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeHeaderEncrypt : client encryption secret not set!");
            else{
                key = this.protectedHandshakeClientHp;
            }
        } else {
            if( this.protectedHandshakeServerSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeHeaderEncrypt : server encryption secret not set!");
            else{
                key = this.protectedHandshakeServerHp;
            }
        }
        return this._headerEncrypt(this.qtls.getCipher().getAeadEcb(), key as Buffer, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public protectedHandshakeHeaderDecrypt(header: BaseHeader, headerAndEncryptedPayload: Buffer, encryptingEndpoint: EndpointType):Buffer {
        let key = undefined;

        if (encryptingEndpoint === EndpointType.Client) {
            if( this.protectedHandshakeClientSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeHeaderDecrypt : client decryption secret not set!");
            else{
                key = this.protectedHandshakeClientHp;
            }
        } else {
            if( this.protectedHandshakeServerSecret == undefined )
                VerboseLogging.error("aead:protectedHandshakeHeaderDecrypt : server decryption secret not set!");
            else{
                key = this.protectedHandshakeServerHp;
            }
        }
        return this._headerDecrypt(this.qtls.getCipher().getAeadEcb(), key as Buffer, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public protected1RTTHeaderEncrypt(header: BaseHeader, headerAndEncryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        let key = undefined;

        if (encryptingEndpoint === EndpointType.Client) {
            if( this.protected1RTTClientSecret == undefined )
                VerboseLogging.error("aead:protected1RTTHeaderEncrypt : client encryption secret not set!");
            else{
                key = this.protected1RTTClientHp;
            }
        } else {
            if( this.protectedHandshakeServerSecret == undefined )
                VerboseLogging.error("aead:protected1RTTHeaderEncrypt : server encryption secret not set!");
            else{
                key = this.protected1RTTServerHp;
            }
        }
        return this._headerEncrypt(this.qtls.getCipher().getAeadEcb(), key as Buffer, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    public protected1RTTHeaderDecrypt(header: BaseHeader, headerAndEncryptedPayload: Buffer, encryptingEndpoint: EndpointType) {
        let key = undefined;

        if (encryptingEndpoint === EndpointType.Client) { 
            if( this.protected1RTTClientSecret == undefined )
                VerboseLogging.error("aead:protected1RTTHeaderDecrypt : client decryption secret not set! packet probably has to be buffered while waiting for handshake to complete.");
            else{
                key = this.protected1RTTClientHp;
            }
        } else { 
            if( this.protected1RTTServerSecret == undefined )
                VerboseLogging.error("aead:protected1RTTHeaderDecrypt : server decryption secret not set! packet probably has to be buffered while waiting for handshake to complete.");
            else{
                key = this.protected1RTTServerHp;
            }
        }
        return this._headerDecrypt(this.qtls.getCipher().getAeadEcb(), key as Buffer, Constants.SAMPLE_LENGTH, header, headerAndEncryptedPayload);
    }

    // FIXME: make private again, only needed for testing 
    public generateClearTextSecrets(connectionID: ConnectionID, qtls: QTLS, version: Version): void {
        let hkdf = this.getHKDFObject(Constants.DEFAULT_HASH);
        // Generate client key, IV, HP
        let clearTextClientSecret = this.getClearTextSecret(hkdf, connectionID, version, EndpointType.Client);
        this.clearTextClientKey   = hkdf.qhkdfExpandLabel(clearTextClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        this.clearTextClientIv    = hkdf.qhkdfExpandLabel(clearTextClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.clearTextClientHp    = hkdf.qhkdfExpandLabel(clearTextClientSecret, Constants.HEADER_PROTECTION_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        VerboseLogging.debug("clear text client Secret: " + clearTextClientSecret.toString('hex'));
        VerboseLogging.debug("clear text client key: " + this.clearTextClientKey.toString('hex'));
        VerboseLogging.debug("clear text client iv:  " + this.clearTextClientIv.toString('hex'));
        VerboseLogging.debug("clear text client hp:  " + this.clearTextClientHp.toString('hex'));

        // Generate server key, IV, HP
        let clearTextServerSecret = this.getClearTextSecret(hkdf, connectionID, version, EndpointType.Server);
        this.clearTextServerKey = hkdf.qhkdfExpandLabel(clearTextServerSecret, Constants.PACKET_PROTECTION_KEY_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        this.clearTextServerIv = hkdf.qhkdfExpandLabel(clearTextServerSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.clearTextServerHp = hkdf.qhkdfExpandLabel(clearTextServerSecret, Constants.HEADER_PROTECTION_LABEL, Constants.DEFAULT_AEAD_LENGTH);
        VerboseLogging.debug("clear text server Secret: " + clearTextServerSecret.toString('hex'));
        VerboseLogging.debug("clear text server key: " + this.clearTextServerKey.toString('hex'));
        VerboseLogging.debug("clear text server iv:  " + this.clearTextServerIv.toString('hex'));
        VerboseLogging.debug("clear text server hp:  " + this.clearTextServerHp.toString('hex'));

        VerboseLogging.debug("Clear text keys generated for version " + version + ", previous was for version " + this.usedVersion);

        // Keep track of what version is used to generate these keys
        this.usedVersion = version;
    }

    /*
    private generateProtected1RTTSecrets(): void {
        var hkdf = this.getHKDFObject(this.qtls.getCipher().getHash());
        this.protected1RTTClientSecret = this.qtls.exportKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.CLIENT_1RTT_LABEL);
        this.protected1RTTServerSecret = this.qtls.exportKeyingMaterial(Constants.EXPORTER_BASE_LABEL + Constants.SERVER_1RTT_LABEL);
        this.generateKeyAndIv(hkdf, this.qtls);
    }
    */

    /*
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
    */

    /*
    public updateProtected1RTTSecret(): void {
        var hkdf = this.getHKDFObject(this.qtls.getCipher().getHash());
        this.protected1RTTClientSecret = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.CLIENT_1RTT_LABEL, this.qtls.getCipher().getHashLength());
        this.protected1RTTServerSecret = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.SERVER_1RTT_LABEL, this.qtls.getCipher().getHashLength());
        this.generateKeyAndIv(hkdf, this.qtls);
    }
    */

    /*
    private generateKeyAndIv(hkdf: HKDF, qtls: QTLS) {
        // Generate Client key, IV, PN
        this.protected1RTTClientKey = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_KEY_LABEL, qtls.getCipher().getAeadKeyLength());
        this.protected1RTTClientIv = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.protected1RTTClientPn = hkdf.qhkdfExpandLabel(this.protected1RTTClientSecret, Constants.PACKET_PROTECTION_PN_LABEL, qtls.getCipher().getAeadKeyLength());
        console.log("protected1RTT client Secret: " + this.protected1RTTClientSecret.toString('hex'));
        console.log("protected1RTT client key: " + this.protected1RTTClientKey.toString('hex'));
        console.log("protected1RTT client iv: " + this.protected1RTTClientIv.toString('hex'));
        console.log("protected1RTT client pn: " + this.protected1RTTClientPn.toString('hex'));

        // Generate Server key, IV, PN
        this.protected1RTTServerKey = hkdf.qhkdfExpandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_KEY_LABEL, qtls.getCipher().getAeadKeyLength());
        this.protected1RTTServerIv = hkdf.qhkdfExpandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH);
        this.protected1RTTServerPn = hkdf.qhkdfExpandLabel(this.protected1RTTServerSecret, Constants.PACKET_PROTECTION_PN_LABEL, qtls.getCipher().getAeadKeyLength());
        console.log("protected1RTT server Secret: " + this.protected1RTTServerSecret.toString('hex'));
        console.log("protected1RTT server key: " + this.protected1RTTServerKey.toString('hex'));
        console.log("protected1RTT server iv: " + this.protected1RTTServerIv.toString('hex'));
        console.log("protected1RTT server pn: " + this.protected1RTTServerPn.toString('hex'));
    }
    */

    public setProtectedHandshakeSecrets(endpoint:EndpointType, secret:Buffer){
        VerboseLogging.debug("aead:setProtectedHandshakeSecrets : set HANDSHAKE secrets for " + EndpointType[endpoint] );

        let hkdf = this.getHKDFObject(this.qtls.getCipher().getHash()); 
    
        if( endpoint == EndpointType.Client ){
            this.protectedHandshakeClientSecret = secret;
            this.protectedHandshakeClientKey = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_KEY_LABEL,  this.qtls.getCipher().getAeadKeyLength());
            this.protectedHandshakeClientIv  = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_IV_LABEL,   Constants.IV_LENGTH); 
            this.protectedHandshakeClientHp  = hkdf.qhkdfExpandLabel(secret, Constants.HEADER_PROTECTION_LABEL,      this.qtls.getCipher().getAeadKeyLength());
        
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake secret: " + this.protectedHandshakeClientSecret.toString('hex') );
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake key:    " + this.protectedHandshakeClientKey.toString('hex') );
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake iv:     " + this.protectedHandshakeClientIv.toString('hex') );
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake hp:     " + this.protectedHandshakeClientHp.toString('hex') );
        }
        else if( endpoint == EndpointType.Server ){
            this.protectedHandshakeServerSecret = secret;
            this.protectedHandshakeServerKey = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_KEY_LABEL,  this.qtls.getCipher().getAeadKeyLength());
            this.protectedHandshakeServerIv  = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_IV_LABEL,   Constants.IV_LENGTH);
            this.protectedHandshakeServerHp  = hkdf.qhkdfExpandLabel(secret, Constants.HEADER_PROTECTION_LABEL,      this.qtls.getCipher().getAeadKeyLength());
        
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake secret: " + this.protectedHandshakeServerSecret.toString('hex') );
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake key:    " + this.protectedHandshakeServerKey.toString('hex') );
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake iv:     " + this.protectedHandshakeServerIv.toString('hex') );
            VerboseLogging.debug( EndpointType[endpoint] + " TLS handshake hp:     " + this.protectedHandshakeServerHp.toString('hex') );
        }
        else
            VerboseLogging.error("aead:setProtectedHandshakeSecrets : unknown endpoint type : " + endpoint);




        /*
       ROBIN: Snelste ding om te doen:
	- zorgen dat handshake packets ook effectief ge-encrypt worden met de handshake keys ipv cleartext
	- kijken wat ngtcp2 daarop zegt -> if decode succesful, dan gewoon laten as-is en verder gaan naar packet number spaces etc.
		-> refactoren naar CryptoContext kan later nog altijd 
    */

        // NOTE: before we had to manually calculate the key and iv as well, based on the secret
        // we also had to fetch the secret ourselves using this.qtls.exportEarlyKeyingMaterial(...)
        // now, with the callbacks from openSSL, we just get this from the stack, and only need to calculate the PNE key
        //console.log("OLD key: " + hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_KEY_LABEL, this.qtls.getCipher().getAeadKeyLength()).toString('hex') );
        //console.log("OLD iv:  " + hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH).toString('hex') );
        //console.log("OLD pn:  " + hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_PN_LABEL, this.qtls.getCipher().getAeadKeyLength()).toString('hex') );
    }

    public setProtected1RTTSecrets(endpoint:EndpointType, secret:Buffer){

        VerboseLogging.debug("aead:setProtected1RTTSecrets : set 1RTT secrets for " + EndpointType[endpoint] );

        let hkdf = this.getHKDFObject(this.qtls.getCipher().getHash()); 
    
        if( endpoint == EndpointType.Client ){
            this.protected1RTTClientSecret = secret;
            this.protected1RTTClientKey = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_KEY_LABEL,  this.qtls.getCipher().getAeadKeyLength());
            this.protected1RTTClientIv  = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_IV_LABEL,   Constants.IV_LENGTH);
            this.protected1RTTClientHp  = hkdf.qhkdfExpandLabel(secret, Constants.HEADER_PROTECTION_LABEL,      this.qtls.getCipher().getAeadKeyLength());

            VerboseLogging.debug("protected1RTT client Secret: " + this.protected1RTTClientSecret.toString('hex'));
            VerboseLogging.debug("protected1RTT client key: " + this.protected1RTTClientKey.toString('hex'));
            VerboseLogging.debug("protected1RTT client iv: " + this.protected1RTTClientIv.toString('hex'));
            VerboseLogging.debug("protected1RTT client hp: " + this.protected1RTTClientHp.toString('hex'));
        }
        else if( endpoint == EndpointType.Server ){
            this.protected1RTTServerSecret = secret;
            this.protected1RTTServerKey = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_KEY_LABEL,  this.qtls.getCipher().getAeadKeyLength());
            this.protected1RTTServerIv  = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_IV_LABEL,   Constants.IV_LENGTH);
            this.protected1RTTServerHp  = hkdf.qhkdfExpandLabel(secret, Constants.HEADER_PROTECTION_LABEL,      this.qtls.getCipher().getAeadKeyLength());
        
            VerboseLogging.debug("protected1RTT server Secret: " + this.protected1RTTServerSecret.toString('hex'));
            VerboseLogging.debug("protected1RTT server key: " + this.protected1RTTServerKey.toString('hex'));
            VerboseLogging.debug("protected1RTT server iv: " + this.protected1RTTServerIv.toString('hex'));
            VerboseLogging.debug("protected1RTT server hp: " + this.protected1RTTServerHp.toString('hex'));
        }
        else
            VerboseLogging.error("aead:setProtected1RTTSecretsNew : unknown endpoint type : " + endpoint);



        /*
        VerboseLogging.warn("generate 1RTT secrets");
        console.log("TLS in secret: " + secret.toString('hex') );
        console.log("TLS in key:    " + key.toString('hex') );
        console.log("TLS in iv:     " + iv.toString('hex') );

        if (this.protected1RTTClientSecret === undefined || this.protected1RTTServerSecret === undefined) {
            
            var hkdf = this.getHKDFObject(this.qtls.getCipher().getHash());
            this.protected1RTTClientSecret = secret;
            this.protected1RTTServerSecret = secret;
            this.generateKeyAndIv(hkdf, this.qtls); 
        }

        else{

            console.log("protected1RTT client Secret: " + this.protected1RTTClientSecret.toString('hex'));
            console.log("protected1RTT client key: " + this.protected1RTTClientKey.toString('hex'));
            console.log("protected1RTT client iv: " + this.protected1RTTClientIv.toString('hex'));
            console.log("protected1RTT client pn: " + this.protected1RTTClientPn.toString('hex'));

            console.log("protected1RTT server Secret: " + this.protected1RTTServerSecret.toString('hex'));
            console.log("protected1RTT server key: " + this.protected1RTTServerKey.toString('hex'));
            console.log("protected1RTT server iv: " + this.protected1RTTServerIv.toString('hex'));
            console.log("protected1RTT server pn: " + this.protected1RTTServerPn.toString('hex'));
        }

        VerboseLogging.warn("generate 1RTT secrets DONE");
        */
    }

    public setProtected0TTSecrets(endpoint:EndpointType, secret:Buffer){

        VerboseLogging.debug("aead:setProtected0TTSecrets : set 0RTT secrets for " + EndpointType[endpoint] );

        let hkdf = this.getHKDFObject(this.qtls.getCipher().getHash()); 
    
        if( endpoint == EndpointType.Client ){
            this.protected0RTTClientSecret = secret;
            this.protected0RTTKey = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_KEY_LABEL,this.qtls.getCipher().getAeadKeyLength());
            this.protected0RTTIv  = hkdf.qhkdfExpandLabel(secret, Constants.PACKET_PROTECTION_IV_LABEL, Constants.IV_LENGTH); 
            this.protected0RTTHp  = hkdf.qhkdfExpandLabel(secret, Constants.HEADER_PROTECTION_LABEL,    this.qtls.getCipher().getAeadKeyLength());

            VerboseLogging.debug("protected0RTT client Secret: " + this.protected0RTTClientSecret.toString('hex'));
            VerboseLogging.debug("protected0RTT client key: " + this.protected0RTTKey.toString('hex'));
            VerboseLogging.debug("protected0RTT client iv: " + this.protected0RTTIv.toString('hex'));
            VerboseLogging.debug("protected0RTT client hp: " + this.protected0RTTHp.toString('hex'));
        }
        else if( endpoint == EndpointType.Server ){
            VerboseLogging.error("aead:setProtected0TTSecrets : cannot set 0RTT secrets for the server, because they shouldn't exist!");
        }
    }

    /**
     * Method to get the cleartext secret.
     * @param hkdf 
     * @param connectionID ConnectionID from the connection
     * @param encryptingEndpoint The endpoint that encrypts/encrypted the payload
     */
    private getClearTextSecret(hkdf: HKDF, connectionID: ConnectionID, version: Version, encryptingEndpoint: EndpointType): Buffer {
        var quicVersionSalt = Buffer.from(Constants.getVersionSalt(version.toString()), 'hex');
        if( quicVersionSalt === undefined || quicVersionSalt.byteLength === 0 ){
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "aead:getClearTextSecrets : salt is not defined! " + version.toString() + " // " + Constants.getVersionSalt(version.toString()) + " // " + version.getValue().toString());
        }

        var clearTextSecret = hkdf.extract(quicVersionSalt, connectionID.toBuffer());

        var label = Constants.CLIENT_INITIAL_LABEL;
        if (encryptingEndpoint === EndpointType.Server) { 
            label = Constants.SERVER_INITIAL_LABEL;
        }
        
        VerboseLogging.info("getClearTextSecret " + clearTextSecret.toString('hex') + " // " + connectionID.toBuffer().toString('hex') + ", " + quicVersionSalt.toString('hex') + " // " + label );
        return hkdf.qhkdfExpandLabel(clearTextSecret, label, Constants.DEFAULT_HASH_SIZE);
    }

    private calculateNonce(packetNumber: PacketNumber, iv: Buffer): Bignum {
        var pnb = packetNumber.getValue();
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

    private _headerEncrypt(algorithm: string, hpKey: Buffer, sampleLength: number, header: BaseHeader, headerAndEncryptedPayload: Buffer): Buffer {
        VerboseLogging.debug("aead:_headerEncrypt : used key: " + hpKey.toString('hex') + ", algorithm: " + algorithm );
        //console.log("pnbuffer: " + packetNumberBuffer.toString('hex'));
        // TODO: we're passing the total packet length here, not the payload length!!!

        let sampleOffset = this.getHeaderProtectionSampleOffset(sampleLength, header, headerAndEncryptedPayload.byteLength);
        let sampleData   = headerAndEncryptedPayload.slice(sampleOffset, sampleOffset + sampleLength);

        // https://stackoverflow.com/questions/41134562/node-js-crypto-invalid-iv-length
        // ECB mode doesn't have an initialization vector, so just use a 0-length buffer
        let cipher = createCipheriv(algorithm, hpKey, Buffer.alloc(0));
        let update = cipher.update(sampleData);

        let mask:Buffer = update.slice(0, 5);

        /*
        mask = header_protection(hp_key, sample)

        pn_length = (packet[0] & 0x03) + 1
        if (packet[0] & 0x80) == 0x80:
            # Long header: 4 bits masked
            packet[0] ^= mask[0] & 0x0f
        else:
            # Short header: 5 bits masked
            packet[0] ^= mask[0] & 0x1f

        # pn_offset is the start of the Packet Number field.
        packet[pn_offset:pn_offset+pn_length] ^= mask[1:1+pn_length]
        */

       VerboseLogging.info("_headerEncrypt : before PN protection : " + headerAndEncryptedPayload.slice(0, sampleOffset + 4).toString("hex") );

        // PN length are the 2 rightmost bits of the first byte
        let pnLength = (headerAndEncryptedPayload[0] & 0x03) + 1;

        // for long headers, we mask the 4 rightmost bits (mostly 2 reserved bits and 2 PN length bits)
        if( header.getHeaderType() === HeaderType.LongHeader ){
            headerAndEncryptedPayload[0] ^= mask[0] & 0x0f;
        }
        // for short headers, we mask the 5 rightmost bits: key phase update bit, 2 reserved bits and 2 PN length bits
        else{
            headerAndEncryptedPayload[0] ^= mask[0] & 0x1f;
        }

        let pnOffset = sampleOffset - 4; // we pretend the PN is always 4 bytes long for the sample offset, so -4 if conveniently the start of the PN field
        for( let i = 0; i < pnLength; ++i ){
            headerAndEncryptedPayload[pnOffset + i] ^= mask[1 + i];
        }

        VerboseLogging.info("_headerEncrypt : aftere PN protection : " + headerAndEncryptedPayload.slice(0, sampleOffset + 4).toString("hex") );

        return headerAndEncryptedPayload;
    }

    private _headerDecrypt(algorithm: string, hpKey: Buffer, sampleLength: number, header: BaseHeader, headerAndEncryptedPayload: Buffer): Buffer {
 
        let sampleOffset = this.getHeaderProtectionSampleOffset(sampleLength, header, headerAndEncryptedPayload.byteLength);
        let sampleData   = headerAndEncryptedPayload.slice(sampleOffset, sampleOffset + sampleLength);

        let cipher = createCipheriv(algorithm, hpKey, Buffer.alloc(0));
        let update = cipher.update(sampleData);

        let mask:Buffer = update.slice(0, 5);
        VerboseLogging.info("_headerDecrypt : before PN unprotect : " + headerAndEncryptedPayload.slice(0, sampleOffset + 4).toString("hex") );


        // for long headers, we mask the 4 rightmost bits (mostly 2 reserved bits and 2 PN length bits)
        if( header.getHeaderType() === HeaderType.LongHeader ){
            headerAndEncryptedPayload[0] ^= mask[0] & 0x0f;
        }
        // for short headers, we mask the 5 rightmost bits: key phase update bit, 2 reserved bits and 2 PN length bits
        else{
            headerAndEncryptedPayload[0] ^= mask[0] & 0x1f;
        }

        // PN length are the 2 rightmost bits of the first byte
        let pnLength = (headerAndEncryptedPayload[0] & 0x03) + 1;

        let pnOffset = sampleOffset - 4; // we pretend the PN is always 4 bytes long for the sample offset, so -4 if conveniently the start of the PN field
        for( let i = 0; i < pnLength; ++i ){
            headerAndEncryptedPayload[pnOffset + i] ^= mask[1 + i];
        }

        VerboseLogging.info("_headerDecrypt : aftere PN unprotect : " + headerAndEncryptedPayload.slice(0, sampleOffset + 4).toString("hex") );

        return headerAndEncryptedPayload;
    }

    /**
     * Calculate the offset for the payload sample we need for Header Protection 
     * Used pseudocode from https://tools.ietf.org/html/draft-ietf-quic-tls-20#section-5.4.2
     */
    private getHeaderProtectionSampleOffset(sampleLength: number, header: BaseHeader, payloadLength: number): number {
        let sampleOffset: number = 0;

        // We want a sample of the encrypted payload to use as AD for our header protection
        // This sample is always 16 bytes (at least in draft-20... it may change, that's why we kept the sampleLength parameter but don't use it) 
        // and starts after the encoded packet number in the header
        // However, since the Header Protection also encrypts the Packet Number length (in the first byte of the header)
        // we wouldn't know exactly where to start sampling when decrypting...
        // This is why we always pretend like the packet number is 4 bytes long for Header Protection

        // A part of the text that was confusing:
        /*
            "To ensure that sufficient data is available for sampling, packets are
            padded so that the combined lengths of the encoded packet number and
            protected payload is at least 4 bytes longer than the sample required
            for header protection.  For the AEAD functions defined in [TLS13],
            which have 16-byte expansions and 16-byte header protection samples,
            this results in needing at least 3 bytes of frames in the unprotected
            payload if the packet number is encoded on a single byte, or 2 bytes
            of frames for a 2-byte packet number encoding."
        */
        // Here, it would seem like we would need 20 bytes of payload to get the 16 byte sample, though the text only tells us to pad with 2 or 3 bytes, not 19 or 18
        // The crux is that the AEAD algorithm for PACKET PROTECTION (which is done before HEADER protection, see _encrypt) adds a 16-byte auth_tag to the end of the packet/payload
        // So we get: size = len(pn) + len(payload) + sizeof(auth_tag)  =>  sample = 4..20  and size should be at least 20
        // And thus, padding frames with 2 or 3 is enough, because auth_tag is always 16 bytes, enough for the sample

        // TODO: maybe we can make this easier, by just using the header buffer (should already have that by now) and just doing some logic based on the truncated PN length?
            // would make it a lot easier, not having to deal with the Initial packet separately here etc.
            // for that, we do need to store the header buffer or pass it around

        if (header.getHeaderType() === HeaderType.LongHeader) {
            let longHeader = <LongHeader>header;

            sampleOffset = 6 // 1st byte + 4 bytes version + 1 byte connection id lengths
                           + longHeader.getDestConnectionID().getByteLength() 
                           + longHeader.getSrcConnectionID().getByteLength() 
                           + longHeader.getPayloadLengthBuffer().byteLength 
                           + 4; // 4 bytes of pretend packet number
                           
            if( longHeader.getPacketType() == LongHeaderType.Initial ){
                sampleOffset += VLIE.encode(longHeader.getInitialTokenLength()).byteLength;

                if( longHeader.hasInitialTokens() )
                    sampleOffset += (longHeader.getInitialTokens() as Buffer).byteLength;
            }
            //console.log("///////////////////////////////getSampleOffset LONG : ", sampleOffset, header.getParsedBuffer().byteLength);
        } 
        else {
            let shortHeader = <ShortHeader>header;
            sampleOffset = 1 // first byte
                           + shortHeader.getDestConnectionID().getByteLength() 
                           + 4; // 4 bytes of pretend packet number
            //console.log("///////////////////////////////getSampleOffset SHORT : ", sampleOffset, header.getParsedBuffer().byteLength);
        }

        // Seeing as we pretend the packet number is 4 btyes long,
        // This also means the remaining payload needs to be at least 16 bytes long (we are obligated to pad the packet if not)
        if( (payloadLength - sampleOffset) < Constants.SAMPLE_LENGTH ){    
            throw new QuicError( ConnectionErrorCodes.PROTOCOL_VIOLATION, "aead:getHeaderProtectionSampleOffset : Not enough bytes left after the sampleoffset to perform header encryption/decryption. Remember to pad your small packets!");
        }

        return sampleOffset;
    }

    private getHKDFObject(hash: string) {
        if (!(hash in this.hkdfObjects)) {
            this.hkdfObjects[hash] = new HKDF(hash);
        }
        return this.hkdfObjects[hash];
    }
}
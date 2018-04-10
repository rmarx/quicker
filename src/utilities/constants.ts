export class Constants {
    /**
     * Supported versions
     */
    public static readonly SUPPORTED_VERSIONS = [
        'ff00000a'
    ];

    public static readonly LOG_TYPE = "stdout";
    public static readonly LOG_LEVEL = 'debug';
    public static readonly LOG_LARGE_BUFFER_DATA = false;
    public static readonly MAX_LOG_FILE_SIZE = 20971520;

    /**
     * Dictionary for the mapping between QUIC version and their version specific salt
     */
    public static readonly VERSION_SALTS: { [id: string] : string; } = {
        'ff00000a': '9c108f98520a5c5c32968e950e8a2c5fe06d6c38',
        'abcdef0a': '9c108f98520a5c5c32968e950e8a2c5fe06d6c38',
    }
    public static readonly ALPN_LABEL = "hq-10";
    
    public static readonly LONG_HEADER_SIZE = 17;
    public static readonly LONG_HEADER_VN_SIZE = 13;
    public static readonly LONG_HEADER_PACKET_NUMBER_SIZE = 4;

    public static readonly PATH_CHALLENGE_PAYLOAD_SIZE = 8;
    public static readonly PATH_RESPONSE_PAYLOAD_SIZE = 8;

    /**
     * Default algorithm for cleartext encryption/decryption in QUIC
     */
    public static readonly DEFAULT_AEAD = 'aes-128-gcm';
    public static readonly DEFAULT_AEAD_LENGTH = 16;
    public static readonly DEFAULT_HASH = 'sha256';
    public static readonly DEFAULT_HASH_SIZE = 32;
    public static readonly IV_LENGTH = 12;
    // All ciphersuites currently defined for TLS 1.3 - and therefore QUIC -	
 	// have a 16-byte authentication tag and produce an output 16 bytes	
 	// larger than their input.
    public static readonly TAG_LENGTH = 16;


    /**
     * default values for transport extensions
     */
    public static readonly DEFAULT_MAX_STREAM_CLIENT_BIDI = 12;
    public static readonly DEFAULT_MAX_STREAM_SERVER_BIDI = 12 + 1;
    public static readonly DEFAULT_MAX_STREAM_CLIENT_UNI = 12 + 2;
    public static readonly DEFAULT_MAX_STREAM_SERVER_UNI = 12 + 3;
    public static readonly DEFAULT_MAX_STREAM_DATA = 10 * 1024;
    public static readonly DEFAULT_MAX_DATA = 50 * 1024;
    public static readonly DEFAULT_ACK_EXPONENT = 3;
    public static readonly DEFAULT_IDLE_TIMEOUT = 30;
    public static readonly MAX_PACKET_SIZE = 1252;

    public static readonly MAX_STREAM_ID_INCREMENT = 100;
    public static readonly MAX_STREAM_ID_BUFFER_SPACE = 28;

    /**
     * Client initial must be at least 1200 octets
     */
    public static readonly CLIENT_INITIAL_MIN_SIZE = 1200;

    public static readonly QHKDF_BASE_LABEL = "QUIC ";
    public static readonly EXPORTER_BASE_LABEL = "EXPORTER-QUIC ";
    public static readonly CLIENT_HANDSHAKE_LABEL = "client hs";
    public static readonly SERVER_HANDSHAKE_LABEL = "server hs";
    public static readonly CLIENT_0RTT_LABEL = "0rtt";
    public static readonly CLIENT_1RTT_LABEL = "client 1rtt";
    public static readonly SERVER_1RTT_LABEL = "server 1rtt";
    public static readonly PACKET_PROTECTION_KEY_LABEL = "key";
    public static readonly PACKET_PROTECTION_IV_LABEL = "iv";
    
    public static readonly TEMPORARY_DRAINING_TIME = 15000;

    public static readonly MAXIMUM_CLOSE_FRAME_SEND = 5;

    /**
     * Method for testing purposes only
     */
    public static getActiveVersion(): string {
        return this.SUPPORTED_VERSIONS[0];
    }

    public static getVersionSalt(version: string): string {
        return Constants.VERSION_SALTS[version];
    }

}
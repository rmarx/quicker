export class Constants {
    /**
     * Supported versions
     */
    public static readonly SUPPORTED_VERSIONS = [
        'ff000008'
    ];

    public static readonly LOG_LEVEL = 'debug';
    public static readonly LOG_LARGE_BUFFER_DATA = false;

    /**
     * Dictionary for the mapping between QUIC version and their version specific salt
     */
    public static readonly VERSION_SALTS: { [id: string] : string; } = {
        'ff000008': 'afc824ec5fc77eca1e9d36f37fb2d46518c36639'
    }
    
    public static readonly LONG_HEADER_SIZE = 17;
    public static readonly LONG_HEADER_PACKET_NUMBER_SIZE = 4;

    /**
     * Default algorithm for cleartext encryption/decryption in QUIC
     */
    public static readonly DEFAULT_AEAD = 'aes-128-gcm';
    public static readonly DEFAULT_AEAD_LENGTH = 16;
    public static readonly DEFAULT_HASH = 'sha256';
    public static readonly DEFAULT_HASH_SIZE = 32;
    public static readonly IV_LENGTH = 12;
    public static readonly TAG_LENGTH = 16;


    /**
     * default values for transport extensions
     */
    public static readonly DEFAULT_MAX_STREAM_SERVER_BIDI = 1024 + 1;
    public static readonly DEFAULT_MAX_STREAM_CLIENT_UNI = 1024 + 2;
    public static readonly DEFAULT_MAX_STREAM_SERVER_UNI = 1024 + 3;
    public static readonly DEFAULT_MAX_STREAM_CLIENT_BIDI = 1024 + 4;
    public static readonly DEFAULT_MAX_STREAM_ID = 1024;
    public static readonly DEFAULT_MAX_STREAM_DATA = 10 * 1024 * 1024;
    public static readonly DEFAULT_MAX_DATA = 50 * 1024 * 1024;
    public static readonly DEFAULT_ACK_EXPONENT = 3;
    public static readonly MAX_IDLE_TIMEOUT = 600;
    public static readonly MAX_PACKET_SIZE = 65527;

    public static readonly CLIENT_INITIAL_MIN_SIZE = 1280;

    /**
     * Method for testing purposes only
     */
    public static getActiveVersion() {
        return Constants.SUPPORTED_VERSIONS[0];
    }

    public static getVersionSalt(version: string): string {
        return Constants.VERSION_SALTS[version];
    }

}
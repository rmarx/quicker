export class Constants {
    /**
     * Supported versions
     */
    public static readonly SUPPORTED_VERSIONS = [
        'ff000007'
    ];

    /**
     * Dictionary for the mapping between QUIC version and their version specific salt
     */
    public static readonly VERSION_SALTS: { [id: string] : string; } = {
        'ff000007': 'afc824ec5fc77eca1e9d36f37fb2d46518c36639'
    }
    
    public static readonly LONG_HEADER_SIZE = 17;

    /**
     * Default algorithm for cleartext encryption/decryption in QUIC
     */
    public static readonly DEFAULT_AEAD = 'aes-128-gcm';
    public static readonly DEFAULT_HASH = 'sha256';

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
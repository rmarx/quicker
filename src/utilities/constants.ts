import { VerboseLogging } from "./logging/verbose.logging";

export class Constants {

    public static DEBUG_fakeECN:boolean = false;
    public static DEBUG_fakeReorder:boolean = false;
    public static DEBUG_greaseTransportParameters:boolean = true;
    public static DEBUG_lossAndDuplicatesInHandshake:boolean = false;
    public static DEBUG_1RTT_packetLoss_ratio:number = -1; // set to 0 or < 0 to disable. Higher = more loss

    /**
     * Supported versions
     */
    public static readonly SUPPORTED_VERSIONS = [
        'ff000014','abcdef0c'
    ];

    public static readonly LOG_TYPE = "stdout";
    public static          LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
    public static          LOG_FILE_NAME: string = 'server.log';
    public static          QLOG_FILE_NAME?: string;
    public static readonly LOG_LARGE_BUFFER_DATA = true;
    public static readonly MAX_LOG_FILE_SIZE = 2000971520; 

    /**
     * Dictionary for the mapping between QUIC version and their version specific salt
     */
    public static readonly VERSION_SALTS: { [id: string] : string; } = {
        'ff000014': 'ef4fb0abb47470c41befcf8031334fae485e09a0',
        'abcdef0c': 'ef4fb0abb47470c41befcf8031334fae485e09a0'
    }
    public static ALPN_LABELS = ["h3-20", "hq-20", "hq-19"];//["h3-20", "hq-19"]; // these are the labels that we offer as server
    public static readonly ALPN_VALID_HTTP3  = ["h3-20"];
    public static readonly ALPN_VALID_HTTP09 = ["hq-20", "hq-19"];

    
    public static readonly LONG_HEADER_PACKET_NUMBER_SIZE = 4;

    public static readonly PATH_CHALLENGE_PAYLOAD_SIZE = 8;
    public static readonly PATH_RESPONSE_PAYLOAD_SIZE = 8;

    /**
     * Default algorithm for cleartext encryption/decryption in QUIC
     */
    public static readonly DEFAULT_CIPHER = "TLS_AES_128_GCM_SHA256";
    public static readonly DEFAULT_AEAD_GCM = 'aes-128-gcm';
    public static readonly DEFAULT_AEAD_CTR = 'aes-128-ctr';
    public static readonly DEFAULT_AEAD_ECB = 'aes-128-ecb';
    public static readonly DEFAULT_AEAD_LENGTH = 16;
    public static readonly DEFAULT_HASH = 'sha256';
    public static readonly DEFAULT_HASH_SIZE = 32;
    public static readonly IV_LENGTH = 12;
    public static readonly SAMPLE_LENGTH = 16;
    // All ciphersuites currently defined for TLS 1.3 - and therefore QUIC -	
 	// have a 16-byte authentication tag and produce an output 16 bytes	
 	// larger than their input.
    public static readonly TAG_LENGTH = 16;


    /**
     * default values for transport extensions
     */
    public static readonly DEFAULT_MAX_STREAM_CLIENT_BIDI = 12;
    public static readonly DEFAULT_MAX_STREAM_SERVER_BIDI = 12;
    public static readonly DEFAULT_MAX_STREAM_CLIENT_UNI = 12;
    public static readonly DEFAULT_MAX_STREAM_SERVER_UNI = 12;
    public static readonly DEFAULT_MAX_STREAM_DATA = 50000 * 1024;
    public static readonly DEFAULT_MAX_DATA = 50000 * 1024; // TODO: we have a bug in our connection-level flow control, that's why this is so big. See issue #70
    public static readonly DEFAULT_ACK_DELAY_EXPONENT = 3;
    public static readonly DEFAULT_MAX_ACK_DELAY = 25; // ms
    public static readonly DEFAULT_IDLE_TIMEOUT = 10;
    public static readonly DEFAULT_MAX_PACKET_SIZE = 1400;//65527;

    public static readonly DEFAULT_DISABLE_MIGRATION = false;
    public static readonly DEFAULT_ACTIVE_CONNECTION_ID_LIMIT = 0;

    public static readonly DEFAULT_MAX_STREAM_ID_INCREMENT = 100;
    public static readonly DEFAULT_MAX_STREAM_ID_BUFFER_SPACE = 28;

    /**
     * Initial packet must be at least 1200 octets
     */
    public static readonly INITIAL_MIN_SIZE = 1200;

    public static readonly EXPORTER_BASE_LABEL          = "EXPORTER-QUIC ";
    public static readonly CLIENT_INITIAL_LABEL         = "client in";
    public static readonly SERVER_INITIAL_LABEL         = "server in"; 
    public static readonly PACKET_PROTECTION_KEY_LABEL  = "quic key";
    public static readonly PACKET_PROTECTION_IV_LABEL   = "quic iv";
    public static readonly HEADER_PROTECTION_LABEL      = "quic hp";
    
    public static readonly TEMPORARY_DRAINING_TIME = 15000;

    public static readonly MAXIMUM_CLOSE_FRAME_SEND = 5;

    /**
     * Method for testing purposes only
     */
    public static getActiveVersion(): string {
        return this.SUPPORTED_VERSIONS[0];
    }

    public static getVersionSalt(version: string): string {
        let salt = Constants.VERSION_SALTS[version];
		if( !salt ){
			VerboseLogging.error("Constants::getVersionSalt : ERROR: salt not found for this version. Should only happen if we're explicitly testing version negotation at the client!!!");
			salt = "6666666666666666666666666666666666666666";     
		}
        return salt;
    }

    /**
     * HTTP/3
     */
    public static EXPOSED_SERVER_DIR?: string; // subdirectory of public/ that will be exposed to clients, just exposes public/ if left undefined
}

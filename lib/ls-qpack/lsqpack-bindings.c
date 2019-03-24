#include "node_api.h"
#include "lsqpack.h"
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdio.h>
#include <sys/types.h>

// TODO Memory freeing

#define BYTE_TO_BINARY_PATTERN "%c%c%c%c%c%c%c%c"
#define BYTE_TO_BINARY(byte)  \
  (byte & 0x80 ? '1' : '0'), \
  (byte & 0x40 ? '1' : '0'), \
  (byte & 0x20 ? '1' : '0'), \
  (byte & 0x10 ? '1' : '0'), \
  (byte & 0x08 ? '1' : '0'), \
  (byte & 0x04 ? '1' : '0'), \
  (byte & 0x02 ? '1' : '0'), \
  (byte & 0x01 ? '1' : '0')

#define MAX_ENCODERS 64 // FIXME Currently just an arbitrary number
#define MAX_ENCODED_BUFFER_SIZE 2048 // FIXME Currently just an arbitrary number

static struct lsqpack_enc * encoders[MAX_ENCODERS];
static uint32_t num_encoders = 0;

/** Prints out the given string to confirm that argument passing works. Then returns the same string back.
 * @param:
 *  - argv[0]: string (buffer can hold up to 255 chars)
 * @returns: The same string (up to 255 chars)
*/
napi_value testBindings(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    size_t argc = 1;
    napi_value ret;

    char string_buf[256];
    size_t copy_size;

    // Get argv
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'testBindings' call.");
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Incorrect parameter count in 'testBindings' call. Expected 1 argument");
    }

    status = napi_get_value_string_utf8(env, argv[0], string_buf, 256, &copy_size);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert passed argument to a string in 'testBindings' call.");
    }

    printf("You passed the following string to the native library: `%s`\n", string_buf);

    status = napi_create_string_utf8(env, string_buf, 256, &ret);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert passed string back to napi_value in 'testBindings' call.");
    }

    return ret;
}

/* Args: Object
    {
        max_table_size: number (unsigned),
        dyn_table_size: number (unsigned),
        max_risked_streams: number (unsigned),
        is_server: boolean
    }
    Returns: id of the new encoder as a uint32 (number in javascript)
*/
napi_value createEncoder(napi_env env, napi_callback_info info) {
    if (num_encoders >= MAX_ENCODERS) {
        return NULL;
    }

    napi_status status;
    napi_value argv[1];
    size_t argc = 1;

    napi_value encoderID; // Return value
    napi_value max_table_size_napi_value;
    napi_value dyn_table_size_napi_value;
    napi_value max_risked_streams_napi_value;
    napi_value is_server_napi_value;

    uint32_t max_table_size;
    uint32_t dyn_table_size;
    uint32_t max_risked_streams;
    bool is_server;
    enum lsqpack_enc_opts opts;

    // Get argv
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'createEncoder' call.");
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Incorrect parameter count in 'createEncoder' call. Expected 1 argument");
    }

    status = napi_get_named_property(env, argv[0], "max_table_size", &max_table_size_napi_value);
    status |= napi_get_named_property(env, argv[0], "dyn_table_size", &dyn_table_size_napi_value);
    status |= napi_get_named_property(env, argv[0], "max_risked_streams", &max_risked_streams_napi_value);
    status |= napi_get_named_property(env, argv[0], "is_server", &is_server_napi_value);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all required parameters from parameter object in 'createEncoder' call.");
    }

    // Convert from napi_value to uint32s
    status = napi_get_value_uint32(env, max_table_size_napi_value, &max_table_size);
    status |= napi_get_value_uint32(env, dyn_table_size_napi_value, &dyn_table_size);
    status |= napi_get_value_uint32(env, max_risked_streams_napi_value, &max_risked_streams);
    status |= napi_get_value_bool(env, is_server_napi_value, &is_server);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert all required paramters from parameter object to expected types in 'createEncoder' call.");
    }

    // Flags mark that encoder has been preinit and if the encoder belongs to a server or client
    opts = LSQPACK_ENC_OPT_STAGE_2 | is_server ? LSQPACK_ENC_OPT_SERVER : 0;

    struct lsqpack_enc * enc = (struct lsqpack_enc*) malloc(sizeof(struct lsqpack_enc));
    lsqpack_enc_preinit(enc, NULL);
    // FIXME TSU_BUF may only be NULL if max_table_size == dyn_table_size
    lsqpack_enc_init(enc, NULL, max_table_size, dyn_table_size, max_risked_streams, opts, NULL /* TODO TSU_BUF*/, NULL/* TODO TSU_BUF_SZ*/);

    // FIXME: Possible race condition with num encoders. Use semaphore/mutex if code could be executed in multiple threads
    napi_create_uint32(env, num_encoders, &encoderID);
    encoders[num_encoders++] = enc;

    return encoderID;
}

static struct HttpHeader {
    char * name;
    size_t name_len;
    char * value;
    size_t value_len;
} HttpHeader;

/* Args: Object
    {
        encoderID: number (unsigned),
        streamID: number (unsigned),
        headers: {
            name: string,
            value: string
        }[]
    }
*/
napi_value encodeHeaders(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value ret;
    napi_value argv[1];
    size_t argc = 1;
    napi_value properties[3]; // encoderID, streamID, headers
    uint32_t encoderID;
    uint32_t streamID;
    uint32_t headerCount;
    struct HttpHeader * headers;

    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'encodeHeaders' call.");
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Too many arguments for 'encodeHeaders' call.");
    }

    status = napi_get_named_property(env, argv[0], "encoderID", &properties[0]);
    status |= napi_get_named_property(env, argv[0], "streamID", &properties[1]);
    status |= napi_get_named_property(env, argv[0], "headers", &properties[2]);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all necessary properties from parameter object in 'encodeHeaders' call.");
    }

    status = napi_get_value_uint32(env, properties[0], &encoderID);
    status |= napi_get_value_uint32(env, properties[1], &streamID);
    status |= napi_get_array_length(env, properties[2], &headerCount);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert values from parameter object to correct types in 'encodeHeaders' call.");
    }

    if (encoderID > MAX_ENCODERS) {
        napi_throw_error(env, NULL, "EncoderID is larger than maximum allowed encoderID initialized in 'encodeHeaders' call.");
    }

    if (encoders[encoderID] == NULL) {
        napi_throw_error(env, NULL, "Encoder with given ID has not yet been initialized in 'encodeHeaders' call.");
    }

    lsqpack_enc_start_header(encoders[encoderID], streamID, 0); // TODO find out what seqno is used for

    headers = malloc(sizeof(HttpHeader) * headerCount);
    napi_value headerNapi;
    napi_value headerProperty;
    size_t headerPropertyLen;

    unsigned char ** enc_bufs = malloc(sizeof(unsigned char*) * headerCount);
    size_t * enc_szs = malloc(sizeof(size_t) * headerCount);
    size_t total_enc_sz = 0;

    unsigned char ** header_bufs = malloc(sizeof(unsigned char*) * headerCount);
    size_t * header_szs = malloc(sizeof(size_t) * headerCount);
    size_t total_header_sz = 0;

    // Convert to HttpHeaders
    for (size_t i = 0; i < headerCount; ++i) {
        status = status | napi_get_element(env, properties[2], i, &headerNapi);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve header object from header list in 'encodeHeaders' call.");
        }

        status = status | napi_get_named_property(env, headerNapi, "name", &headerProperty);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headername from header object in 'encodeHeaders' call.");
        }

        status |= napi_get_value_string_utf8(env, headerProperty, NULL, 0, &headerPropertyLen);
        headers[i].name = malloc(sizeof(char) * headerPropertyLen + 1);
        headers[i].name_len = headerPropertyLen;
        status |= napi_get_value_string_utf8(env, headerProperty, headers[i].name, headerPropertyLen+1, NULL);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headername from header object in 'encodeHeaders' call.");
        }

        status |= napi_get_named_property(env, headerNapi, "value", &headerProperty);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headervalue from header object in 'encodeHeaders' call.");
        }

        status |= napi_get_value_string_utf8(env, headerProperty, NULL, 0, &headerPropertyLen);
        headers[i].value = malloc(sizeof(char) * headerPropertyLen + 1);
        headers[i].value_len = headerPropertyLen;
        status |= napi_get_value_string_utf8(env, headerProperty, headers[i].value, headerPropertyLen+1, NULL);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headervalue from header object in 'encodeHeaders' call.");
        }

        // FIXME non arbitrary values
        unsigned char enc_buf[1024];
        enc_szs[i] = 1024;
        unsigned char header_buf[1024];
        header_szs[i] = 1024;

        enum lsqpack_enc_status encode_status = lsqpack_enc_encode(encoders[encoderID], enc_buf/*enc_buf*/, &enc_szs[i]/*enc_sz*/, header_buf/*header_buf*/, &header_szs[i]/*header_sz*/, headers[i].name, headers[i].name_len, headers[i].value, headers[i].value_len, 0 /*FIXME find out what this is*/);

        switch (encode_status) {
            case LQES_OK:
                printf("Encoding of header %u went ok\n", (unsigned) i);
                break;
            case LQES_NOBUF_ENC:
                printf("Encoding of header %u ended with error LQES_NOBUF_ENC\n", (unsigned) i);
                break;
            case LQES_NOBUF_HEAD:
                printf("Encoding of header %u ended with error LQES_NOBUF_HEAD\n", (unsigned) i);
                break;
        }

        // Save header bufs
        enc_bufs[i] = (unsigned char *) malloc(enc_szs[i]);
        memcpy(enc_bufs[i], enc_buf, enc_szs[i]);
        total_enc_sz += enc_szs[i];
        header_bufs[i] = (unsigned char *) malloc(header_szs[i]);
        memcpy(header_bufs[i], header_buf, header_szs[i]);
        total_header_sz += header_szs[i];
    }

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert all properties of parameter object to required types in 'encodeHeaders' call.");
    }

    unsigned char header_data_prefix[1024 /*FIXME non arbitrary value*/];
    ssize_t bytes_written = lsqpack_enc_end_header(encoders[encoderID], header_data_prefix, 1024);

    if (bytes_written == 0) {
        napi_throw_error(env, NULL, "Could not copy header prefix data into buffer: buffer too small. Call: 'encodeHeaders'");
    }

    if (bytes_written < 0) {
        napi_throw_error(env, NULL, "Error transferring header prefix data into buffer in 'encodeHeaders' call");
    }

    printf("Prefix: <%.*s>\nPrefix size: %lu\nTotal header size: %lu\nTotal encoder size: %lu\n", bytes_written, header_data_prefix, bytes_written, total_header_sz, total_enc_sz);

    unsigned char * complete_header = (unsigned char*) malloc(total_header_sz);
    size_t offset = 0;

    for (size_t i = 0; i < headerCount; ++i) {
        memcpy(complete_header+offset, header_bufs[i], header_szs[i]);
        offset += header_szs[i];
    }

    for (size_t i = 0; i < total_header_sz; ++i) {
        printf("Header[%u]: "BYTE_TO_BINARY_PATTERN"\n", (unsigned) i, BYTE_TO_BINARY(complete_header[i]));
    }
    
    unsigned char * buffer = malloc(bytes_written + total_header_sz);
    memcpy(buffer, header_data_prefix, bytes_written);
    memcpy(buffer+bytes_written, complete_header, total_header_sz);
    
    status = napi_create_buffer(env, bytes_written + total_header_sz, &buffer, &ret);
    
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not create buffer object from headers in 'encodeHeaders' call.");
    }
    
    return ret;
}

// Args: id of the encoder to delete
napi_value deleteEncoder(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    size_t argc = 1;
    uint32_t encoderID;

    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'deleteEncoder' call. Expected arguments: encoderID: number");
    }

    status = napi_get_value_uint32(env, argv[0], &encoderID);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "EncdoerID passed to deleteEncoder could not be converted to uint32.");
    }

    // Free the encoder
    if (encoderID < MAX_ENCODERS && encoders[encoderID] != NULL) {
        lsqpack_enc_cleanup(encoders[encoderID]);
        encoders[encoderID] = NULL;
    }
}

napi_value init(napi_env env, napi_value exports) {
    napi_status status;
    napi_value result;

    status = napi_create_function(env, "testBindings", NAPI_AUTO_LENGTH, testBindings, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'testBindings' function");
    }

    status = napi_set_named_property(env, exports, "testBindings", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'testBindings' function to exports");
    }

    status = napi_create_function(env, "createEncoder", NAPI_AUTO_LENGTH, createEncoder, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'createEncoder' function");
    }

    status = napi_set_named_property(env, exports, "createEncoder", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'createEncoder' function to exports");
    }

    status = napi_create_function(env, "encodeHeaders", NAPI_AUTO_LENGTH, encodeHeaders, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'encodeHeaders' function");
    }

    status = napi_set_named_property(env, exports, "encodeHeaders", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'encodeHeaders' function to exports");
    }
    
    status = napi_create_function(env, "deleteEncoder", NAPI_AUTO_LENGTH, deleteEncoder, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'deleteEncoder' function");
    }

    status = napi_set_named_property(env, exports, "deleteEncoder", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'deleteEncoder' function to exports");
    }

    for (size_t i = 0; i < MAX_ENCODERS; ++i) {
        encoders[i] = NULL;
    }

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
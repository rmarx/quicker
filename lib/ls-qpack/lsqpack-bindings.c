#include "node_api.h"
#include "lsqpack.h"
#include <stdlib.h>

#define MAX_ENCODERS 64 // FIXME Currently just an arbitrary number
#define MAX_ENCODED_BUFFER_SIZE 2048 // FIXME Currently just an arbitrary number

static struct lsqpack_enc * encoders[MAX_ENCODERS];
static uint32_t num_encoders = 0;

// Args: max_table_size, dyn_table_size, max_risked_streams, qpack_enc_options
// Returns: id of the new encoder
napi_value createEncoder(napi_env env, napi_callback_info info) {
    if (num_encoders >= MAX_ENCODERS) {
        return NULL;
    }
    
    napi_value value;
    
    struct lsqpack_enc * enc = (struct lsqpack_enc*) malloc(sizeof(struct lsqpack_enc));
    lsqpack_enc_preinit(enc, NULL);
    lsqpack_enc_init(enc, NULL, /*MAX_TABLE_SIZE*/, /*DYN_TABLE_SIZE*/, /*MAX_RISKED_STREAMS*/, /*QPACK_ENC_OPTIONS*/, /*TSU_BUF*/, /*TSU_BUF_SZ*/);

    // FIXME: Possible race condition with num encoders. Use semaphore/mutex if code could be executed in multiple threads
    napi_create_uint32(env, num_encoders, &value);
    encoders[num_encoders++] = enc;
    
    return value;
}

static struct HttpHeader {
    char * name;
    size_t name_len;
    char * value;
    size_t value_len;
} HttpHeader;

/* Args: Object
    {
        encoderID: number,
        streamID: number,
        headers: {
            name: string,
            value: string
        }[]
    }
*/
napi_value encodeHeaders(napi_env env, napi_callback_info info) {
    napi_status status;
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
    status = status | napi_get_named_property(env, argv[0], "streamID", &properties[1]);
    status = status | napi_get_named_property(env, argv[0], "headers", &properties[2]);
    
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all necessary properties from parameter object in 'encodeHeaders' call.");
    }
    
    status = napi_get_value_uint32(env, properties[0], &encoderID);
    status = status | napi_get_value_uint32(env, properties[1], &streamID);
    status = status | napi_get_array_length(env, properties[2], &headerCount);
    
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
    
    // Convert to HttpHeaders
    for (int i = 0; i < headerCount; ++i) {
        status = status | napi_get_element(env, properties[2], i, &headerNapi);
        
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve header object from header list in 'encodeHeaders' call.");
        }
        
        status = status | napi_get_named_property(env, headerNapi, "name", &headerProperty);
        
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headername from header object in 'encodeHeaders' call.");
        }
        
        status = status | napi_get_value_string_utf8(env, headerProperty, NULL, 0, &headerPropertyLen);
        headers[i].name = malloc(sizeof(char) * headerPropertyLen + 1);
        headers[i].name_len = headerPropertyLen;
        status = status | napi_get_value_string_utf8(env, headerProperty, headers[i].name, headerPropertyLen+1, NULL);
        
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headername from header object in 'encodeHeaders' call.");
        }
        
        status = status | napi_get_named_property(env, headerNapi, "value", &headerProperty);
        
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headervalue from header object in 'encodeHeaders' call.");
        }
        
        status = status | napi_get_value_string_utf8(env, headerProperty, NULL, 0, &headerPropertyLen);
        headers[i].value = malloc(sizeof(char) * headerPropertyLen + 1);
        headers[i].value_len = headerPropertyLen;
        status = status | napi_get_value_string_utf8(env, headerProperty, headers[i].value, headerPropertyLen+1, NULL);
        
        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headervalue from header object in 'encodeHeaders' call.");
        }
        
        lsqpack_enc_encode(encoders[encoderID], /*enc_buf*/, /*enc_sz*/, /*header_buf*/, /*header_sz*/, headers[i].name, headers[i].name_len, headers[i].value, headers[i].value_len, 0 /*FIXME find out what this is*/);
    }
    
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert all properties of parameter object to required types in 'encodeHeaders' call.");
    }
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

napi_value encodeBuffer(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    size_t argc = 1;
    
    
}

napi_value init(napi_env env, napi_value exports) {
    napi_status status;
    napi_value result;

    status = napi_create_function(env, "createEncoder", NAPI_AUTO_LENGTH, createEncoder, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'createEncoder' function");
    }

    status = napi_set_named_property(env, exports, "createEncoder", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'createEncoder' function to exports");
    }
    
    for (int i = 0; i < MAX_ENCODERS; ++i) {
        encoders[i] = NULL;
    }

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
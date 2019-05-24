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

#define MAX_DECODERS 64 // FIXME Currently just an arbitrary number

static struct lsqpack_enc * encoders[MAX_ENCODERS];
static struct lsqpack_dec * decoders[MAX_DECODERS];
static uint32_t num_encoders = 0;
static uint32_t num_decoders = 0;

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
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Incorrect parameter count in 'testBindings' call. Expected 1 argument");
        return NULL;
    }

    status = napi_get_value_string_utf8(env, argv[0], string_buf, 256, &copy_size);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert passed argument to a string in 'testBindings' call.");
        return NULL;
    }

    printf("You passed the following string to the native library: `%s`\n", string_buf);

    status = napi_create_string_utf8(env, string_buf, 256, &ret);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert passed string back to napi_value in 'testBindings' call.");
        return NULL;
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
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Incorrect parameter count in 'createEncoder' call. Expected 1 argument");
        return NULL;
    }

    status = napi_get_named_property(env, argv[0], "max_table_size", &max_table_size_napi_value);
    status |= napi_get_named_property(env, argv[0], "dyn_table_size", &dyn_table_size_napi_value);
    status |= napi_get_named_property(env, argv[0], "max_risked_streams", &max_risked_streams_napi_value);
    status |= napi_get_named_property(env, argv[0], "is_server", &is_server_napi_value);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all required parameters from parameter object in 'createEncoder' call.");
        return NULL;
    }

    // Convert from napi_value to uint32s
    status = napi_get_value_uint32(env, max_table_size_napi_value, &max_table_size);
    status |= napi_get_value_uint32(env, dyn_table_size_napi_value, &dyn_table_size);
    status |= napi_get_value_uint32(env, max_risked_streams_napi_value, &max_risked_streams);
    status |= napi_get_value_bool(env, is_server_napi_value, &is_server);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert all required paramters from parameter object to expected types in 'createEncoder' call.");
        return NULL;
    }

    // Flags mark that encoder has been preinit and if the encoder belongs to a server or client
    opts = LSQPACK_ENC_OPT_STAGE_2 | is_server ? LSQPACK_ENC_OPT_SERVER : 0;

    struct lsqpack_enc * enc = malloc(sizeof(struct lsqpack_enc));
    lsqpack_enc_preinit(enc, NULL);
    // FIXME TSU_BUF may only be NULL if max_table_size == dyn_table_size
    lsqpack_enc_init(enc, NULL, max_table_size, dyn_table_size, max_risked_streams, opts, NULL /* TODO TSU_BUF*/, NULL/* TODO TSU_BUF_SZ*/);

    // FIXME: Possible race condition with num encoders. Use semaphore/mutex if code could be executed in multiple threads
    napi_create_uint32(env, num_encoders, &encoderID);
    encoders[num_encoders++] = enc;

    return encoderID;
}

void hblock_unblocked(void * hblock) {
    printf("\n\n\nLSQPACK CALLBACK TRIGGERED: HBLOCK_UNBLOCKED\n\n\n");
}

/* Args: Object
    {
        dyn_table_size: number (unsigned),
        max_risked_streams: number (unsigned),
    }
    Returns: id of the new decoder as a uint32 (number in javascript)
*/
napi_value createDecoder(napi_env env, napi_callback_info info) {
    if (num_decoders >= MAX_DECODERS) {
        return NULL;
    }

    napi_status status;
    napi_value argv[1];
    size_t argc = 1;

    napi_value decoderID; // Return value
    napi_value dyn_table_size_napi_value;
    napi_value max_risked_streams_napi_value;
    
    uint32_t dyn_table_size;
    uint32_t max_risked_streams;
    
    // Get argv
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'createDecoder' call.");
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Incorrect parameter count in 'createDecoder' call. Expected 1 argument");
        return NULL;
    }

    status |= napi_get_named_property(env, argv[0], "dyn_table_size", &dyn_table_size_napi_value);
    status |= napi_get_named_property(env, argv[0], "max_risked_streams", &max_risked_streams_napi_value);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all required parameters from parameter object in 'createDecoder' call.");
        return NULL;
    }
    
    // Convert from napi_value to uint32s
    status |= napi_get_value_uint32(env, dyn_table_size_napi_value, &dyn_table_size);
    status |= napi_get_value_uint32(env, max_risked_streams_napi_value, &max_risked_streams);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert all required paramters from parameter object to expected types in 'createDecoder' call.");
        return NULL;
    }
    
    struct lsqpack_dec * dec = malloc(sizeof(struct lsqpack_dec));
    lsqpack_dec_init(dec, NULL, dyn_table_size, max_risked_streams, hblock_unblocked);
    
    // FIXME: Possible race condition with num decoders. Use semaphore/mutex if code could be executed in multiple threads
    napi_create_uint32(env, num_decoders, &decoderID);
    decoders[num_decoders++] = dec;

    return decoderID;
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
    @returns: [Headerblock: Buffer, encoderdata: Buffer]
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
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Too many arguments for 'encodeHeaders' call.");
        return NULL;
    }

    status = napi_get_named_property(env, argv[0], "encoderID", &properties[0]);
    status |= napi_get_named_property(env, argv[0], "streamID", &properties[1]);
    status |= napi_get_named_property(env, argv[0], "headers", &properties[2]);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all necessary properties from parameter object in 'encodeHeaders' call.");
        return NULL;
    }

    status = napi_get_value_uint32(env, properties[0], &encoderID);
    status |= napi_get_value_uint32(env, properties[1], &streamID);
    status |= napi_get_array_length(env, properties[2], &headerCount);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert values from parameter object to correct types in 'encodeHeaders' call.");
        return NULL;
    }

    if (encoderID > MAX_ENCODERS) {
        napi_throw_error(env, NULL, "EncoderID is larger than maximum allowed encoderID initialized in 'encodeHeaders' call.");
        return NULL;
    }

    if (encoders[encoderID] == NULL) {
        napi_throw_error(env, NULL, "Encoder with given ID has not yet been initialized in 'encodeHeaders' call.");
        return NULL;
    }

    lsqpack_enc_start_header(encoders[encoderID], streamID, 0); // TODO find out what seqno is used for

    headers = malloc(sizeof(HttpHeader) * headerCount);
    napi_value headerNapi;
    napi_value headerProperty;
    size_t headerPropertyLen;

    unsigned char * enc_buf = malloc(0);
    size_t total_enc_sz = 0;

    unsigned char * header_buf = malloc(0);
    size_t total_header_sz = 0;

    // Convert to HttpHeaders
    for (size_t i = 0; i < headerCount; ++i) {
        status = status | napi_get_element(env, properties[2], i, &headerNapi);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve header object from header list in 'encodeHeaders' call.");
            return NULL;
        }

        status = status | napi_get_named_property(env, headerNapi, "name", &headerProperty);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headername from header object in 'encodeHeaders' call.");
            return NULL;
        }

        status |= napi_get_value_string_utf8(env, headerProperty, NULL, 0, &headerPropertyLen);
        headers[i].name = malloc(sizeof(char) * headerPropertyLen + 1);
        headers[i].name_len = headerPropertyLen;
        status |= napi_get_value_string_utf8(env, headerProperty, headers[i].name, headerPropertyLen+1, NULL);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headername from header object in 'encodeHeaders' call.");
            return NULL;
        }

        status |= napi_get_named_property(env, headerNapi, "value", &headerProperty);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headervalue from header object in 'encodeHeaders' call.");
            return NULL;
        }

        status |= napi_get_value_string_utf8(env, headerProperty, NULL, 0, &headerPropertyLen);
        headers[i].value = malloc(sizeof(char) * headerPropertyLen + 1);
        headers[i].value_len = headerPropertyLen;
        status |= napi_get_value_string_utf8(env, headerProperty, headers[i].value, headerPropertyLen+1, NULL);

        if (status != napi_ok) {
            napi_throw_error(env, NULL, "Could not retrieve headervalue from header object in 'encodeHeaders' call.");
            return NULL;
        }

        // FIXME non arbitrary values
        unsigned char tmp_enc_buf[1024];
        size_t enc_sz = 1024;
        unsigned char tmp_header_buf[1024];
        size_t header_sz = 1024;

        enum lsqpack_enc_status encode_status = lsqpack_enc_encode(encoders[encoderID], tmp_enc_buf, &enc_sz, tmp_header_buf, &header_sz, headers[i].name, headers[i].name_len, headers[i].value, headers[i].value_len, 0 /*FIXME find out what this is*/);

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

        // Increase allocated memory
        enc_buf = realloc(enc_buf, total_enc_sz+enc_sz);
        header_buf = realloc(header_buf, total_header_sz+header_sz);

        // Append to buffers
        memcpy(enc_buf+total_enc_sz, tmp_enc_buf, enc_sz);
        memcpy(header_buf+total_header_sz, tmp_header_buf, header_sz);

        total_enc_sz += enc_sz;
        total_header_sz += header_sz;
    }

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert all properties of parameter object to required types in 'encodeHeaders' call.");
        return NULL;
    }

    unsigned char header_data_prefix[1024 /*FIXME non arbitrary value*/];
    ssize_t prefix_sz = lsqpack_enc_end_header(encoders[encoderID], header_data_prefix, 1024);

    if (prefix_sz == 0) {
        napi_throw_error(env, NULL, "Could not copy header prefix data into buffer: buffer too small. Call: 'encodeHeaders'");
        return NULL;
    }

    if (prefix_sz < 0) {
        napi_throw_error(env, NULL, "Error transferring header prefix data into buffer in 'encodeHeaders' call");
        return NULL;
    }

    printf("Prefix size: %lu\nTotal header size: %lu\nTotal encoder size: %lu\n", prefix_sz, total_header_sz, total_enc_sz);

    for (size_t i = 0; i < total_header_sz; ++i) {
        printf("header_buffer[%u]: "BYTE_TO_BINARY_PATTERN"\n", (unsigned) i, BYTE_TO_BINARY(header_buf[i]));
    }
    
    for (size_t i = 0; i < total_enc_sz; ++i) {
        printf("encoder_buffer[%u]: "BYTE_TO_BINARY_PATTERN"\n", (unsigned) i, BYTE_TO_BINARY(enc_buf[i]));
    }
    
    void * header_buffer;
    void * encoder_buffer;
    napi_value header_buffer_napi_value;
    napi_value encoder_buffer_napi_value;

    status = napi_create_buffer(env, prefix_sz + total_header_sz, &header_buffer, &header_buffer_napi_value);
    status |= napi_create_buffer(env, total_enc_sz, &encoder_buffer, &encoder_buffer_napi_value);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not create buffer objects from headers or encoderdata in 'encodeHeaders' call.");
        return NULL;
    }
    
    // [Headerblock, encoderdata]
    status = napi_create_array_with_length(env, 2, &ret);
    
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not create array for return value in 'encodeHeaders' call.");
        return NULL;
    }
    
    status = napi_set_element(env, ret, 0, header_buffer_napi_value);
    status |= napi_set_element(env, ret, 1, encoder_buffer_napi_value);

    memcpy(header_buffer, header_data_prefix, prefix_sz);
    memcpy(header_buffer+prefix_sz, header_buf, total_header_sz);
    
    memcpy(encoder_buffer, enc_buf, total_enc_sz);
    
    // Free used memory
    for (size_t i = 0; i < headerCount; ++i) {
        free(headers[i].name);
        free(headers[i].value);
    }
    free(headers);
    free(enc_buf);
    free(header_buf);
    
    printf("Dynamic table insertion count: %u\n", encoders[encoderID]->qpe_ins_count);

    return ret;
}

/* Args: Object
    {
        decoderID: number (unsigned),
        streamID: number (unsigned),
        headerBuffer: Buffer,
    }
    @returns: Object
    {
        status: number
            1: Success
            0: Needs more data to decode headers
            -1: Blocked, more dynamic table entries needed
            -2: Error, fatal,
        headers: HttpHeader{
            name: string,
            value: string,    
        }[],
    }
*/
napi_value decodeHeaders(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    napi_value properties[3]; // decoderID, streamID, headerBuffer
    size_t argc = 1;
    uint32_t decoderID;
    uint32_t streamID;
    void * header_buffer;
    size_t header_buffer_sz;
    struct lsqpack_header_set * hset = NULL;
    unsigned char dec_buf[LSQPACK_LONGEST_HACK];
    size_t dec_buf_sz;
    
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'decodeHeaders' call.");
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Too many arguments for 'decodeHeaders' call.");
        return NULL;
    }

    status = napi_get_named_property(env, argv[0], "decoderID", &properties[0]);
    status |= napi_get_named_property(env, argv[0], "streamID", &properties[1]);
    status |= napi_get_named_property(env, argv[0], "headerBuffer", &properties[2]);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all necessary properties from parameter object in 'decodeHeaders' call.");
        return NULL;
    }

    status = napi_get_value_uint32(env, properties[0], &decoderID);
    status |= napi_get_value_uint32(env, properties[1], &streamID);
    // FIXME? Warning: Use caution while using napi_get_buffer_info since the underlying data buffer's lifetime is not guaranteed if it's managed by the VM.
    status |= napi_get_buffer_info(env, properties[2], &header_buffer, &header_buffer_sz);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert values from parameter object to correct types in 'decodeHeaders' call.");
        return NULL;
    }
    
    if (decoderID > MAX_DECODERS) {
        napi_throw_error(env, NULL, "DecoderID is larger than maximum allowed decoderID initialized in 'decodeHeaders' call.");
        return NULL;
    }

    if (decoders[decoderID] == NULL) {
        napi_throw_error(env, NULL, "Decoder with given ID has not yet been initialized in 'decodeHeaders' call.");
        return NULL;
    }
    
    printf("Decoding QPack headers: \n\tdecoderID: %u\n\tstreamID: %u\n", decoderID, streamID);

    uint64_t biggerID = (uint64_t) streamID;
    enum lsqpack_read_header_status read_status = lsqpack_dec_header_in(decoders[decoderID], NULL,  biggerID, header_buffer_sz, (const unsigned char**) &header_buffer, header_buffer_sz, &hset, dec_buf, &dec_buf_sz);

    switch (read_status) {
        case LQRHS_DONE:
            printf("Decoder successfully decoded block\n");
            break;
        case LQRHS_NEED:
            printf("Decoder needs more data\n");
            break;
        case LQRHS_BLOCKED:
            printf("Decoder blocked\n");
            break;
        case LQRHS_ERROR:
            napi_throw_error(env, NULL, "Decoding headers returned LQRHS_ERROR statuscode in 'decodeHeaders' call.");
            return NULL;
    }
    
    printf("\n\nPrinting decoder table...\n");
    lsqpack_dec_print_table(decoders[decoderID], stdout);
    printf("\n\n");
    
    if (hset != NULL) {
        // Push results into return value
        napi_value ret;
        napi_value decompressed_headers;
        napi_value decoder_stream_data;
        void * dec_buf_napi;
        
        // TODO check status
        
        napi_create_array_with_length(env, 2, &ret); // [decodedHeaders, decoderStreamData]
        napi_create_array_with_length(env, hset->qhs_count, &decompressed_headers);
        
        printf("Header count: %u\n", hset->qhs_count);
    
        for (size_t i = 0; i < hset->qhs_count; ++i) {
            napi_value header_object;
            napi_value header_name;
            napi_value header_value;
            napi_create_object(env, &header_object);
            
            napi_create_string_utf8(env, hset->qhs_headers[i]->qh_name, hset->qhs_headers[i]->qh_name_len, &header_name);
            napi_create_string_utf8(env, hset->qhs_headers[i]->qh_value, hset->qhs_headers[i]->qh_value_len, &header_value);
            napi_set_named_property(env, header_object, "name", header_name);
            napi_set_named_property(env, header_object, "value", header_value);
            
            napi_set_element(env, decompressed_headers, i, header_object);
            
            printf("Header[%lu]: \nName: %.*s\nValue: %.*s\n", i, hset->qhs_headers[i]->qh_name_len, hset->qhs_headers[i]->qh_name, hset->qhs_headers[i]->qh_value_len, hset->qhs_headers[i]->qh_value);
        }
        
        napi_create_buffer(env, dec_buf_sz, &dec_buf_napi, &decoder_stream_data);
        memcpy(dec_buf_napi, dec_buf, dec_buf_sz);
        
        napi_set_element(env, ret, 0, decompressed_headers);
        napi_set_element(env, ret, 1, decoder_stream_data);
        
        return ret;
    } else {
        printf("Header set is NULL\n");
        napi_throw_error(env, NULL, "QPACK: Header set is null while decoding headers in 'decodeHeaders' call.");
        return NULL;
    }
}

/**
 * Feed the decoder data from the encoderstream
 *  Args: Object
    {
        decoderID: number (unsigned),
        encoderData: Buffer,
    }
*/
napi_value decoderEncoderStreamData(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    napi_value properties[2]; // decoderID, encoderData
    size_t argc = 1;
    uint32_t decoderID;
    void * encoder_data_buffer;
    size_t encoder_data_buffer_sz;
    
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'decoderEncoderStreamData' call.");
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Too many arguments for 'decoderEncoderStreamData' call.");
        return NULL;
    }

    status = napi_get_named_property(env, argv[0], "decoderID", &properties[0]);
    status |= napi_get_named_property(env, argv[0], "encoderData", &properties[1]);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all necessary properties from parameter object in 'decoderEncoderStreamData' call.");
        return NULL;
    }

    status = napi_get_value_uint32(env, properties[0], &decoderID);
    // FIXME? Warning: Use caution while using napi_get_buffer_info since the underlying data buffer's lifetime is not guaranteed if it's managed by the VM.
    status |= napi_get_buffer_info(env, properties[1], &encoder_data_buffer, &encoder_data_buffer_sz);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert values from parameter object to correct types in 'decoderEncoderStreamData' call.");
        return NULL;
    }
    
    if (decoderID > MAX_DECODERS) {
        napi_throw_error(env, NULL, "DecoderID is larger than maximum allowed decoderID initialized in 'decoderEncoderStreamData' call.");
        return NULL;
    }

    if (decoders[decoderID] == NULL) {
        napi_throw_error(env, NULL, "Decoder with given ID has not yet been initialized in 'decoderEncoderStreamData' call.");
        return NULL;
    }
    
    int dec_enc_in_status = lsqpack_dec_enc_in(decoders[decoderID], encoder_data_buffer, encoder_data_buffer_sz);
    
    if (dec_enc_in_status < 0) {
        napi_throw_error(env, NULL, "Something went wrong processing encoder stream data in 'decoderEncoderStreamData' call");
        return NULL;
    }
    
    printf("\n\nPrinting decoder table after encoderstream data...\n");
    lsqpack_dec_print_table(decoders[decoderID], stdout);
    printf("\n\n");
    
    return NULL;
}

/**
 * Feed the encoder data from the decoderstream
 *  Args: Object
    {
        encoderID: number (unsigned),
        decoderData: Buffer,
    }
*/
napi_value encoderDecoderStreamData(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    napi_value properties[2]; // encoderID, decoderData
    size_t argc = 1;
    uint32_t encoderID;
    void * decoder_data_buffer;
    size_t decoder_data_buffer_sz;
    
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'encoderDecoderStreamData' call.");
        return NULL;
    }

    if (argc != 1) {
        napi_throw_error(env, NULL, "Too many arguments for 'encoderDecoderStreamData' call.");
        return NULL;
    }

    status = napi_get_named_property(env, argv[0], "encoderID", &properties[0]);
    status |= napi_get_named_property(env, argv[0], "decoderData", &properties[1]);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not retrieve all necessary properties from parameter object in 'encoderDecoderStreamData' call.");
        return NULL;
    }

    status = napi_get_value_uint32(env, properties[0], &encoderID);
    // FIXME? Warning: Use caution while using napi_get_buffer_info since the underlying data buffer's lifetime is not guaranteed if it's managed by the VM.
    status |= napi_get_buffer_info(env, properties[1], &decoder_data_buffer, &decoder_data_buffer_sz);

    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not convert values from parameter object to correct types in 'encoderDecoderStreamData' call.");
        return NULL;
    }
    
    if (encoderID > MAX_ENCODERS) {
        napi_throw_error(env, NULL, "EncoderID is larger than maximum allowed encoderID initialized in 'encoderDecoderStreamData' call.");
        return NULL;
    }

    if (encoders[encoderID] == NULL) {
        napi_throw_error(env, NULL, "Encoder with given ID has not yet been initialized in 'encoderDecoderStreamData' call.");
        return NULL;
    }
    
    int enc_dec_in_status = lsqpack_enc_decoder_in(encoders[encoderID], decoder_data_buffer, decoder_data_buffer_sz);
    
    if (enc_dec_in_status < 0) {
        napi_throw_error(env, NULL, "Something went wrong processing encoder stream data in 'encoderDecoderStreamData' call");
    }
    
    return NULL;
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
        return NULL;
    }

    status = napi_get_value_uint32(env, argv[0], &encoderID);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "EncoderID passed to deleteEncoder could not be converted to uint32.");
        return NULL;
    }

    // Free the encoder
    if (encoderID < MAX_ENCODERS && encoders[encoderID] != NULL) {
        printf("Freeing encoder with ID <%u>\n", encoderID);
        lsqpack_enc_cleanup(encoders[encoderID]);
        free(encoders[encoderID]);
        encoders[encoderID] = NULL;
    }
    
    return NULL;
}

// Args: id of the decoder to delete
napi_value deleteDecoder(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value argv[1];
    size_t argc = 1;
    uint32_t decoderID;

    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Could not extract arguments for 'deleteDecoder' call. Expected arguments: decoderID: number");
        return NULL;
    }

    status = napi_get_value_uint32(env, argv[0], &decoderID);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "decoderID passed to deleteDecoder could not be converted to uint32.");
        return NULL;
    }

    // Free the decoder
    if (decoderID < MAX_DECODERS && decoders[decoderID] != NULL) {
        printf("Freeing decoder with ID <%u>\n", decoderID);
        lsqpack_dec_cleanup(decoders[decoderID]);
        free(decoders[decoderID]);
        decoders[decoderID] = NULL;
    }
    
    return NULL;
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
    
    status = napi_create_function(env, "createDecoder", NAPI_AUTO_LENGTH, createDecoder, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'createDecoder' function");
    }

    status = napi_set_named_property(env, exports, "createDecoder", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'createDecoder' function to exports");
    }

    status = napi_create_function(env, "encodeHeaders", NAPI_AUTO_LENGTH, encodeHeaders, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'encodeHeaders' function");
    }

    status = napi_set_named_property(env, exports, "encodeHeaders", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'encodeHeaders' function to exports");
    }

    status = napi_create_function(env, "decodeHeaders", NAPI_AUTO_LENGTH, decodeHeaders, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'decodeHeaders' function");
    }

    status = napi_set_named_property(env, exports, "decodeHeaders", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'decodeHeaders' function to exports");
    }

    status = napi_create_function(env, "decoderEncoderStreamData", NAPI_AUTO_LENGTH, decoderEncoderStreamData, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'decoderEncoderStreamData' function");
    }

    status = napi_set_named_property(env, exports, "decoderEncoderStreamData", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'decoderEncoderStreamData' function to exports");
    }
    
    status = napi_create_function(env, "encoderDecoderStreamData", NAPI_AUTO_LENGTH, encoderDecoderStreamData, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'encoderDecoderStreamData' function");
    }

    status = napi_set_named_property(env, exports, "encoderDecoderStreamData", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'encoderDecoderStreamData' function to exports");
    }

    status = napi_create_function(env, "deleteEncoder", NAPI_AUTO_LENGTH, deleteEncoder, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'deleteEncoder' function");
    }

    status = napi_set_named_property(env, exports, "deleteEncoder", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'deleteEncoder' function to exports");
    }
    
    status = napi_create_function(env, "deleteDecoder", NAPI_AUTO_LENGTH, deleteDecoder, NULL, &result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to wrap 'deleteDecoder' function");
    }

    status = napi_set_named_property(env, exports, "deleteDecoder", result);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Unable to add 'deleteDecoder' function to exports");
    }

    for (size_t i = 0; i < MAX_ENCODERS; ++i) {
        encoders[i] = NULL;
    }

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
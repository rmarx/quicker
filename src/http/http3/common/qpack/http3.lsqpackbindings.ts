import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";
import { LSQPackBindingError, LSQpackBindingErrorCode } from "./errors/http3.lsqpackerror";
import { Http3Header } from "./types/http3.header";

const lsqpack = require("../../../../../build/Debug/lsqpack.node");

export interface CreateEncoderParam {
    max_table_size: number,
    dyn_table_size: number,
    max_risked_streams: number,
    is_server: boolean,
}

export interface CreateDecoderParam {
    dyn_table_size: number,
    max_risked_streams: number,
}

export interface EncodeHeadersParam {
    encoderID: number,
    streamID: number,
    headers: Http3Header[],
}

export interface DecodeHeadersParam {
    decoderID: number,
    streamID: number,
    headerBuffer: Buffer,
}

export interface DecoderEncoderStreamDataParam {
    decoderID: number,
    encoderData: Buffer,
}

export interface EncoderDecoderStreamDataParam {
    encoderID: number,
    decoderData: Buffer,
}

function httpHeaderToString(header: Http3Header): string {
    return "Name: " + header.name + "\tValue: " + header.value + "\n";
}

function httpHeadersToString(headers: Http3Header[]): string {
    let ret: string = "{\n";
    for (const header of headers) {
        ret = ret.concat("\t" + httpHeaderToString(header));
    }
    return ret.concat("}");
}

export function testBindings(): boolean {
    const testString: string = "Let's test if we can pass a string to the native lsqpack library.";
    const ret: string = lsqpack.testBindings(testString);
    return testString === ret;
}

// Creates an lsqpack encoder and returns its ID if it was successful.
// Returns null if max encoders has been exceeded.
export function createEncoder(param: CreateEncoderParam): number {
    const encoderID: number | null = lsqpack.createEncoder(param);

    if (encoderID === null) {
        throw new LSQPackBindingError(LSQpackBindingErrorCode.MAX_ENCODERS_REACHED);
    }

    VerboseLogging.info("encoderID: " + encoderID);
    return encoderID;
}

// Creates an lsqpack decoder and returns its ID if it was successful.
// Returns null if max decoders has been exceeded.
export function createDecoder(param: CreateDecoderParam): number {
    const decoderID: number | null = lsqpack.createDecoder(param);

    if (decoderID === null) {
        throw new LSQPackBindingError(LSQpackBindingErrorCode.MAX_DECODERS_REACHED);
    }

    VerboseLogging.info("decoderID: " + decoderID);
    return decoderID;
}

export function encodeHeaders(param: EncodeHeadersParam): [Buffer, Buffer] {
    const [headers, encoderData]: [Buffer, Buffer] = lsqpack.encodeHeaders(param);
    VerboseLogging.info("Encoded headers using lsqpack library: {\nEncoderID: " + param.encoderID + "\nStreamID: " + param.streamID + "\nPlain headers: " + httpHeadersToString(param.headers) + "\nCompressed: 0x" + headers.toString("hex") + "\n}" + "\nEncoderData: 0x" + encoderData.toString("hex"));
    return [headers, encoderData];
}

export function decodeHeaders(param: DecodeHeadersParam): [Http3Header[], Buffer] {
    VerboseLogging.info("Decoding compressed headers. header_buffer: 0x" + param.headerBuffer.toString("hex"));
    const [headers, decoderData]: [Http3Header[], Buffer] = lsqpack.decodeHeaders(param);
    
    for (const header of headers) {
        VerboseLogging.info("Name: " + header.name + "\nValue: " + header.value + "\n");
    }
    
    VerboseLogging.info("Decoderstream data: 0x" + decoderData.toString("hex"));

    return [headers, decoderData];
}

// Feed encoderstream data to the decoder
export function decoderEncoderStreamData(param: DecoderEncoderStreamDataParam) {
    VerboseLogging.info("Passing encoderstream data to decoder.\nDecoderID: " + param.decoderID + "\nEncoderstream data (hex): 0x" + param.encoderData.toString("hex"));
    lsqpack.decoderEncoderStreamData(param);
}

// Feed decoderstream data to the encoder
export function encoderDecoderStreamData(param: EncoderDecoderStreamDataParam) {
    VerboseLogging.info("Passing decoderstream data to encoder.\nEncoderID: " + param.encoderID + "\nDecoderstream data (hex): 0x" + param.decoderData.toString("hex"));
    lsqpack.encoderDecoderStreamData(param);
}

export function deleteEncoder(encoderID: number): void {
    lsqpack.deleteEncoder(encoderID);
}

export function deleteDecoder(decoderID: number): void {
    lsqpack.deleteDecoder(decoderID);
}

function testLSQPackBindings() {
    VerboseLogging.info("Testing lsqpack encoding");
    
    const encoderID: number | null = createEncoder({
        dyn_table_size: 1024,
        is_server: false,
        max_risked_streams: 16,
        max_table_size: 1024,
    });
    const decoderID: number = createDecoder({
        dyn_table_size: 1024,
        max_risked_streams: 16,
    });

    const [headers_1, encoderData_1] = encodeHeaders({
        encoderID: encoderID,
        headers: [
            {
                name: ":path",
                value: "/",
            },
            {
                name: "path",
                "value": "/",
            },
            {
                name: "content-length",
                "value": "0",
            },
            {
                name: "content-length",
                "value": "15",
            },
        ],
        streamID: 0,
    });
    
    const [decodedHeaders, decoderStreamData]: [Http3Header[], Buffer] = decodeHeaders({
        decoderID,
        headerBuffer: headers_1,
        streamID: 0,
    });
    
    VerboseLogging.info("Decoded headers: " + decodedHeaders.toString());
    /*
    const [headers_2, encoderData_2] = encodeHeaders({
        encoderID: encoderID,
        headers: [
            {
                name: ":path",
                value: "/",
            },
            {
                name: "path",
                "value": "/",
            },
            {
                name: "content-length",
                "value": "0",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
            {
                name: "content-length",
                "value": "15",
            },
        ],
        streamID: 0,
    });
    */

    deleteEncoder(encoderID);
    deleteDecoder(decoderID);
}

import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";
import { LSQPackBindingError, LSQpackBindingErrorCode } from "./errors/http3.lsqpackerror";

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

export interface HttpHeader {
    name: string,
    value: string,
}

export interface EncodeHeadersParam {
    encoderID: number,
    streamID: number,
    headers: HttpHeader[],
}

export interface DecodeHeadersParam {
    decoderID: number,
    streamID: number,
    headerBuffer: Buffer,
}

function httpHeaderToString(header: HttpHeader): string {
    return "Name: " + header.name + "\tValue: " + header.value + "\n";
}

function httpHeadersToString(headers: HttpHeader[]): string {
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

export function decodeHeaders(param: DecodeHeadersParam): HttpHeader[] {
    lsqpack.decodeHeaders(param);
    return [];
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
    
    const decodedHeaders: HttpHeader[] = decodeHeaders({
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

testLSQPackBindings();
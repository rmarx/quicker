import { VerboseLogging } from "../../../../utilities/logging/verbose.logging";

const lsqpack = require("../../../../../build/Debug/lsqpack.node");

export interface createEncoderParam {
    max_table_size: number,
    dyn_table_size: number,
    max_risked_streams: number,
    is_server: boolean,
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

export function createEncoder(param: createEncoderParam): number {
    const encoderID: number = lsqpack.createEncoder(param);
    console.log("encoderID: ", encoderID);
    return encoderID;
}

export function encodeHeaders(param: EncodeHeadersParam): Buffer {
    const headers: Buffer = lsqpack.encodeHeaders(param);
    VerboseLogging.info("Encoded headers using lsqpack library: {\nEncoderID: " + param.encoderID + "\nStreamID: " + param.streamID + "\nPlain headers: " + httpHeadersToString(param.headers) + "\nCompressed: 0x" + headers.toString("hex") + "\n}");
    return headers;
}

export function deleteEncoder(encoderID: number): void {
    lsqpack.deleteEncoder(encoderID);
}

function testEncoding() {
    const encoderID: number = createEncoder({
        dyn_table_size: 1024,
        is_server: false,
        max_risked_streams: 16,
        max_table_size: 1024,
    });
    
    encodeHeaders({
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
    
    deleteEncoder(encoderID);   
}

testEncoding();
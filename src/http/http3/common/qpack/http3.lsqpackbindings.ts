const lsqpack = require("../../../../../build/Release/lsqpack.node");

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

export interface encodeHeadersParam {
    encoderID: number,
    streamID: number,
    headers: HttpHeader[],
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

export function encodeHeaders(param: encodeHeadersParam): Buffer {
    // TODO implement
    lsqpack.encodeHeaders(param);
    return new Buffer(0);
}

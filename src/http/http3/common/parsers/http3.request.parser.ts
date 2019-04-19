import { Http3Request } from "../http3.request";
import { Http3FrameParser } from "./http3.frame.parser";
import { Http3FrameType, Http3BaseFrame } from "../frames/http3.baseframe";
import { Http3DataFrame, Http3HeaderFrame } from "../frames";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";
import { Bignum } from "../../../../types/bignum";
import { Http3QPackEncoder } from "../qpack/http3.qpackencoder";
import { QlogWrapper } from "../../../../utilities/logging/qlog.wrapper";

// Indicates next expected frametype
enum Http3RequestParserState {
    HEADER,
    PAYLOAD_OR_FINAL_HEADER,
    ENDED,
}

export function parseHttp3Message(frames: Http3BaseFrame[], requestStreamID: Bignum, encoder: Http3QPackEncoder): Http3Request {
    let state: Http3RequestParserState = Http3RequestParserState.HEADER;
    let request: Http3Request = new Http3Request(requestStreamID, encoder);
    
    for (let frame of frames) {
        if (state === Http3RequestParserState.HEADER && frame.getFrameType() === Http3FrameType.HEADERS) {
            // TODO parse header
            const headerFrame: Http3HeaderFrame = frame as Http3HeaderFrame;
            request.setHeaders(headerFrame.getHeaders());

            // Update state
            state = Http3RequestParserState.PAYLOAD_OR_FINAL_HEADER;
        } else if (state === Http3RequestParserState.PAYLOAD_OR_FINAL_HEADER) {
            if (frame.getFrameType() === Http3FrameType.DATA) {
                const dataFrame: Http3DataFrame = frame as Http3DataFrame;
                
                // TODO Handle DATA
                request.appendContent(dataFrame.getPayload());
            } else if (frame.getFrameType() === Http3FrameType.HEADERS) {
                state = Http3RequestParserState.ENDED;
            } else {
                throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME);
            }
        } else {
            // Unexpected frame
            throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME);
        }
    }
    
    return request;
}

import { Http3Request } from "../http3.request";
import { parse as parseHttp3Frames } from "../parsers/http3.parser.frame";
import { Http3FrameType } from "../http3.baseframe";
import { Http3DataFrame } from "../frames";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";

// Indicates next expected frametype
enum Http3RequestParserState {
    HEADER,
    PAYLOAD_OR_FINAL_HEADER,
    ENDED,
}

export function parseHttp3Message(buffer: Buffer, offset: number = 0): Http3Request {
    let state: Http3RequestParserState = Http3RequestParserState.HEADER;
    let request: Http3Request = new Http3Request();
    const [http3Frames, _] = parseHttp3Frames(buffer, offset);
    
    for (let frame of http3Frames) {
        if (state === Http3RequestParserState.HEADER && frame.getFrameType() === Http3FrameType.HEADERS) {
            // TODO parse header
            
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

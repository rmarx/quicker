import { Http3FrameType, Http3BaseFrame } from "../frames/http3.baseframe";
import { Http3DataFrame, Http3HeaderFrame } from "../frames";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";
import { Http3Message } from "../http3.message";

// Indicates next expected frametype
enum Http3MessageParserState {
    HEADER,
    PAYLOAD_OR_FINAL_HEADER,
    ENDED,
}

export function parseHttp3Message(frames: Http3BaseFrame[]): Http3Message {
    let state: Http3MessageParserState = Http3MessageParserState.HEADER;
    let headerFrame: Http3HeaderFrame | undefined;
    let dataFrames: Http3DataFrame[] = [];
    let trailingHeaderFrame: Http3HeaderFrame | undefined;

    for (let frame of frames) {
        if (state === Http3MessageParserState.HEADER && frame.getFrameType() === Http3FrameType.HEADERS) {
            headerFrame = frame as Http3HeaderFrame;

            // Update state
            state = Http3MessageParserState.PAYLOAD_OR_FINAL_HEADER;
        } else if (state === Http3MessageParserState.PAYLOAD_OR_FINAL_HEADER) {
            if (frame.getFrameType() === Http3FrameType.DATA) {
                dataFrames.push(frame as Http3DataFrame);
            } else if (frame.getFrameType() === Http3FrameType.HEADERS) {
                // (Optional) trailing part of headers
                trailingHeaderFrame = frame as Http3HeaderFrame;

                state = Http3MessageParserState.ENDED;
            } else {
                throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME, "Encountered invalid frame during parsing of HTTP/3 message. Frame was of type: " + frame.getFrameType());
            }
        } else {
            // Unexpected frame
            throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME, "Encountered invalid frame during parsing of HTTP/3 message. Frame was of type: " + frame.getFrameType());
        }
    }

    if (headerFrame !== undefined) {
        return new Http3Message(headerFrame, dataFrames, trailingHeaderFrame);
    } else {
        throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME, "Tried parsing HTTP/3 message but did not encounter all necessary frames");
    }
}

import { Http3UniStreamTypeFrame, Http3UniStreamType } from "../frames/streamtypes/http3.unistreamtypeframe";
import { VLIE, VLIEOffset } from "../../../../types/vlie";
import { Http3ControlStreamFrameTypeFrame } from "../frames/streamtypes/http3.controlstreamtypeframe";
import { Http3PushStreamTypeFrame } from "../frames/streamtypes/http3.pushstreamtypeframe";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";

export function parseStreamTypeFrame(buffer: Buffer, offset: number = 0): [Http3UniStreamTypeFrame, number] {
    let streamTypeVOffset: VLIEOffset = VLIE.decode(buffer, offset);

    // TODO Fix downcast to number?
    switch(streamTypeVOffset.value.toNumber()) {
        case Http3UniStreamType.CONTROL:
            return Http3ControlStreamFrameTypeFrame.fromBuffer(buffer, offset);
        case Http3UniStreamType.PUSH:
            return Http3PushStreamTypeFrame.fromBuffer(buffer, offset);
        default:
            throw new Http3Error(Http3ErrorCode.HTTP3_UNKNOWN_FRAMETYPE, "Unknown frametype encountered while parsing Http3StreamTypeFrames frames");
    }
}
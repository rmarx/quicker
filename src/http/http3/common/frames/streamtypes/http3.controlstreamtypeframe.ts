import { Http3UniStreamTypeFrame, Http3UniStreamType } from "./http3.unistreamtypeframe";
import { VLIE, VLIEOffset } from "../../../../../types/vlie";
import { Http3Error, Http3ErrorCode } from "../../errors/http3.error";

export class Http3ControlStreamFrameTypeFrame extends Http3UniStreamTypeFrame {    
    public constructor() {
        super();
    }
    
    public toBuffer(): Buffer {
        return VLIE.encode(Http3UniStreamType.PUSH);
    }
    
    public static fromBuffer(buffer: Buffer, offset: number = 0): [Http3ControlStreamFrameTypeFrame, number] {
        const streamTypeVOffset: VLIEOffset = VLIE.decode(buffer, offset);
        
        // Assert streamtype
        if (streamTypeVOffset.value.equals(Http3UniStreamType.CONTROL) === false) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME);
        }

        return [new Http3ControlStreamFrameTypeFrame(), streamTypeVOffset.offset];
    }
    
    public getUniStreamType(): Http3UniStreamType {
        return Http3UniStreamType.CONTROL;
    }
}
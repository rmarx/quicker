import { Http3UniStreamTypeFrame, Http3UniStreamType } from "./http3.unistreamtypeframe";
import { VLIE, VLIEOffset } from "../../../../../types/vlie";
import { Bignum } from "../../../../../types/bignum";
import { Http3Error, Http3ErrorCode } from "../../errors/http3.error";

export class Http3PushStreamTypeFrame extends Http3UniStreamTypeFrame {
    private pushID: Bignum;
    
    public constructor(pushID: Bignum) {
        super();
        this.pushID = pushID;
    }
    
    public toBuffer(): Buffer {
        const streamTypeBuffer: Buffer = VLIE.encode(Http3UniStreamType.PUSH);
        const pushIdBuffer: Buffer = VLIE.encode(this.pushID);
        
        return Buffer.concat([streamTypeBuffer, pushIdBuffer]);
    }
    
    public static fromBuffer(buffer: Buffer, offset: number = 0): [Http3PushStreamTypeFrame, number] {
        const streamTypeVOffset: VLIEOffset = VLIE.decode(buffer, offset);
        
        // Assert streamtype
        if (streamTypeVOffset.value.equals(Http3UniStreamType.PUSH) === false) {
            throw new Http3Error(Http3ErrorCode.HTTP3_UNEXPECTED_FRAME);
        }
        
        const pushIDVOffset: VLIEOffset = VLIE.decode(buffer, streamTypeVOffset.offset);
        
        return [new Http3PushStreamTypeFrame(pushIDVOffset.value), pushIDVOffset.offset];
    }
    
    public getUniStreamType(): Http3UniStreamType {
        return Http3UniStreamType.PUSH;
    }
}
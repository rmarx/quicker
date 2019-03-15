import { Http3BaseFrame, Http3FrameType } from "../common/frames/http3.baseframe";
import { parse as parseFrame } from "../common/parsers/http3.frame.parser";
import { ElementDependencyType, Http3CancelPushFrame, Http3DataFrame, Http3HeaderFrame,Http3PriorityFrame, PrioritizedElementType } from "../common/frames"
import { VLIE } from "../../../types/vlie";

export class TestHttp3Frameparser {
    public static execute(): boolean {
        let testCount = 0;
        
        // Data frames
        if (this.testDataFrame() === true) {
            console.info("HTTP/3 data frame parsing test succeeded")
        } else {
            console.error("HTTP/3 data frame parsing test failed");
            console.error("Failed after " + testCount + " tests");
            return false;
        }
        ++testCount;
        
        // Priority frames
        if (this.testPriorityFrame_1() === true && this.testPriorityFrame_2() === true&&
            this.testPriorityFrame_3() === true && this.testPriorityFrame_4() === true) {
            console.info("HTTP/3 priority frame parsing test succeeded")
        } else {
            console.error("HTTP/3 priority frame parsing test failed");
            console.error("Failed after " + testCount + " tests");
            return false;
        }
        ++testCount;
        
        // Cancel push frames
        if (this.testCancelPushFrame() === true) {
            console.info("HTTP/3 cancel push frame parsing test succeeded")
        } else {
            console.error("HTTP/3 cancel push frame parsing test failed");
            console.error("Failed after " + testCount + " tests");
            return false;
        }
        ++testCount;

        console.info("All " + testCount + " HTTP/3 frame parsing tests succeeded");
        
        return true;
    }
    
    private static testDataFrame(): boolean {
        const payload: Buffer = new Buffer("This is testdata. Can we parse it?");
        const length: Buffer = VLIE.encode(payload.byteLength);
        const type: Buffer = VLIE.encode(Http3FrameType.DATA);
        
        // Create frame
        const frame: Buffer = Buffer.concat([length, type, payload]);
        
        const [baseframe, offset] = parseFrame(frame, 0);
        
        // Assertions
        if (baseframe.length !== 1) {
            return false;
        }
        if (baseframe[0].toBuffer().compare(frame) !== 0) {
            return false;
        }
        
        return true;
    }
    
    private static testHeaderFrame(): boolean {
        
        
        return true;
    }
    
    // With PEID and EDID
    private static testPriorityFrame_1(): boolean {
        // Create frame building blocks
        const types: number = ((PrioritizedElementType.REQUEST_STREAM) << 6) | ((ElementDependencyType.REQUEST_STREAM) << 4);
        const typesBuffer: Buffer = new Buffer([types]);
        const peid: Buffer = VLIE.encode(350);
        const edid: Buffer = VLIE.encode(1024);
        const weight: Buffer = new Buffer([50]);
        const payload: Buffer = Buffer.concat([typesBuffer, peid, edid, weight]);
        const length: Buffer = VLIE.encode(payload.byteLength);
        const type: Buffer = VLIE.encode(Http3FrameType.PRIORITY);
        
        // Create frame
        const frame: Buffer = Buffer.concat([length, type, payload]); 
        
        // Parse it
        const [baseframe, offset] = parseFrame(frame, 0);
        
        // Assertions
        if (baseframe.length !== 1) {
            return false;
        }
        if (baseframe[0].toBuffer().compare(frame) !== 0) {
            return false;
        }
        
        return true;
    }
    
    // With PEID, without EDID
    private static testPriorityFrame_2(): boolean {
        // Create frame building blocks
        const types: number = ((PrioritizedElementType.REQUEST_STREAM) << 6) | ((ElementDependencyType.ROOT) << 4);
        const typesBuffer: Buffer = new Buffer([types]);
        const peid: Buffer = VLIE.encode(350);
        const weight: Buffer = new Buffer([50]);
        const payload: Buffer = Buffer.concat([typesBuffer, peid, weight]);
        const length: Buffer = VLIE.encode(payload.byteLength);
        const type: Buffer = VLIE.encode(Http3FrameType.PRIORITY);
        
        // Create frame
        const frame: Buffer = Buffer.concat([length, type, payload]); 
        
        // Parse it
        const [baseframe, offset] = parseFrame(frame, 0);
        
        // Assertions
        if (baseframe.length !== 1) {
            return false;
        }
        if (baseframe[0].toBuffer().compare(frame) !== 0) {
            return false;
        }
        
        return true;
    }
    
    // Without PEID, with EDID
    private static testPriorityFrame_3(): boolean {
        // Create frame building blocks
        const types: number = ((PrioritizedElementType.CURRENT_STREAM) << 6) | ((ElementDependencyType.REQUEST_STREAM) << 4);
        const typesBuffer: Buffer = new Buffer([types]);
        const edid: Buffer = VLIE.encode(1024);
        const weight: Buffer = new Buffer([50]);
        const payload: Buffer = Buffer.concat([typesBuffer, edid, weight]);
        const length: Buffer = VLIE.encode(payload.byteLength);
        const type: Buffer = VLIE.encode(Http3FrameType.PRIORITY);
        
        // Create frame
        const frame: Buffer = Buffer.concat([length, type, payload]); 
        
        // Parse it
        const [baseframe, offset] = parseFrame(frame, 0);
        
        // Assertions
        if (baseframe.length !== 1) {
            return false;
        }
        if (baseframe[0].toBuffer().compare(frame) !== 0) {
            return false;
        }
        
        return true;
    }
    
    // Without PEID and EDID
    private static testPriorityFrame_4(): boolean {
        // Create frame building blocks
        const types: number = ((PrioritizedElementType.CURRENT_STREAM) << 6) | ((ElementDependencyType.ROOT) << 4);
        const typesBuffer: Buffer = new Buffer([types]);
        const weight: Buffer = new Buffer([50]);
        const payload: Buffer = Buffer.concat([typesBuffer, weight]);
        const length: Buffer = VLIE.encode(payload.byteLength);
        const type: Buffer = VLIE.encode(Http3FrameType.PRIORITY);
        
        // Create frame
        const frame: Buffer = Buffer.concat([length, type, payload]); 
        
        // Parse it
        const [baseframe, offset] = parseFrame(frame, 0);
        
        // Assertions
        if (baseframe.length !== 1) {
            return false;
        }
        if (baseframe[0].toBuffer().compare(frame) !== 0) {
            return false;
        }
        
        return true;
    }
    
    private static testCancelPushFrame(): boolean {
        const payload: Buffer = VLIE.encode(3503); // PushID
        const length: Buffer = VLIE.encode(payload.byteLength);
        const type: Buffer = VLIE.encode(Http3FrameType.CANCEL_PUSH);
        
        // Create frame
        const frame: Buffer = Buffer.concat([length, type, payload]);
        
        const [baseframe, offset] = parseFrame(frame, 0);
        
        // Assertions
        if (baseframe.length !== 1) {
            return false;
        }
        if (baseframe[0].toBuffer().compare(frame) !== 0) {
            return false;
        }
        
        return true;
    }
}
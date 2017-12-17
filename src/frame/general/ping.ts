import { BaseFrame, FrameType } from "../base.frame";



export class PingFrame extends BaseFrame {
    private length: number;
    private data: Buffer;


	public constructor(length: number, data: Buffer) {
        super(FrameType.PING);
		this.length = length;
		this.data = data;
    }
    
    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}

export class PongFrame extends BaseFrame {
    private length: number;
    private data: Buffer;


	public constructor(length: number, data: Buffer) {
        super(FrameType.PONG);
		this.length = length;
		this.data = data;
    }
    
    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}
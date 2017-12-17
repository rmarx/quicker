import { BaseFrame, FrameType } from "../base.frame";



export class ApplicationCloseFrame extends BaseFrame {
    private errorCode: number;
    private phrase: string;

    public constructor(errorCode: number, phrase: string) {
        super(FrameType.APPLICATION_CLOSE);
        this.errorCode = errorCode;
        this.phrase = phrase;
    }

    public toBuffer(): Buffer {
        throw new Error("Method not implemented.");
    }
}
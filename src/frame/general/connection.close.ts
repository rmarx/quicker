import { BaseFrame, FrameType } from "../base.frame";



export class ConnectionCloseFrame extends BaseFrame {
    private errorCode: number;
    private phrase: string;

    public constructor(errorCode: number, phrase: string) {
        super(FrameType.CONNECTION_CLOSE);
        this.errorCode = errorCode;
        this.phrase = phrase;
    }
}
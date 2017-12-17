import {VLIE} from '../../crypto/vlie';
import {BaseFrame, FrameType} from '../base.frame';



export abstract class CloseFrame extends BaseFrame {
    private errorCode: number;
    private phrase: string;

    public constructor(type: FrameType, errorCode: number, phrase: string) {
        super(type);
        this.errorCode = errorCode;
        this.phrase = phrase;
    }

    public toBuffer(): Buffer {
        var phraseLengthBuffer: Buffer = VLIE.encode(this.phrase.length);
        var phraseBuffer: Buffer = Buffer.from(this.phrase, 'utf8');
        var buf = Buffer.alloc(phraseLengthBuffer.byteLength + phraseBuffer.byteLength + 3);
        buf.writeUInt8(this.getType(), 0);
        buf.writeUInt16BE(this.errorCode, 1);
        phraseLengthBuffer.copy(buf, 3);
        phraseBuffer.copy(buf, 3 + phraseLengthBuffer.byteLength);
        return buf;
    }
}

export class ConnectionCloseFrame extends CloseFrame {
    public constructor(errorCode: number, phrase: string) {
        super(FrameType.CONNECTION_CLOSE, errorCode, phrase);
    }
}

export class ApplicationCloseFrame extends CloseFrame {
    public constructor(errorCode: number, phrase: string) {
        super(FrameType.CONNECTION_CLOSE, errorCode, phrase);
    }
}
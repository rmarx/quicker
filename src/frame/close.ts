import {VLIE} from '../crypto/vlie';
import {BaseFrame, FrameType} from './base.frame';



abstract class BaseCloseFrame extends BaseFrame {
    private errorCode: number;
    private phrase: string;

    public constructor(type: FrameType, errorCode: number, phrase: string) {
        super(type, true);
        this.errorCode = errorCode;
        this.phrase = phrase;
    }

    public toBuffer(): Buffer {
        var phraseLengthBuffer: Buffer = VLIE.encode(this.phrase.length);
        var phraseBuffer: Buffer = Buffer.from(this.phrase, 'utf8');
        var buf = Buffer.alloc(phraseLengthBuffer.byteLength + phraseBuffer.byteLength + 3);

        buf.writeUInt8(this.getType(), 0);
        buf.writeUInt16BE(this.errorCode, 1);

        // TODO: Currently we don't log the responsible frame 
        let frameType = VLIE.encode(0); 
        frameType.copy(buf, 3);
        //console.log("VLIE LENGTH : " + frameType.byteLength);

        phraseLengthBuffer.copy(buf, 4);
        phraseBuffer.copy(buf, 4 + phraseLengthBuffer.byteLength);
        return buf;
    }

    public getErrorCode(): number {
        return this.errorCode;
    }
    
    public getErrorPhrase(): string {
        return this.phrase;
    }
}

export class ConnectionCloseFrame extends BaseCloseFrame {
    public constructor(errorCode: number, phrase: string) {
        super(FrameType.CONNECTION_CLOSE, errorCode, phrase);
    }
}

export class ApplicationCloseFrame extends BaseCloseFrame {
    public constructor(errorCode: number, phrase: string) {
        super(FrameType.CONNECTION_CLOSE, errorCode, phrase);
    }
}
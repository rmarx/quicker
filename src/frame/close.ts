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
        let phraseLengthBuffer: Buffer = VLIE.encode(this.phrase.length);
        let phraseBuffer: Buffer = Buffer.from(this.phrase, 'utf8');
        // TODO: Currently we don't log the responsible frame 
        let frameType = VLIE.encode(0); 

        let buf = Buffer.alloc(1 + 2 + frameType.byteLength + phraseLengthBuffer.byteLength + phraseBuffer.byteLength);

        let offset = 0;
        buf.writeUInt8(this.getType(), offset++);
        buf.writeUInt16BE(this.errorCode, offset);
        offset += 2;

        frameType.copy(buf, offset);
        offset += frameType.byteLength;
        //console.log("VLIE LENGTH : " + frameType.byteLength);

        phraseLengthBuffer.copy(buf, offset);
        offset += phraseLengthBuffer.byteLength;
        phraseBuffer.copy(buf, offset);
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
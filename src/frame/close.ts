import {VLIE} from '../types/vlie';
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
        let frameType:Buffer;

        let bufLength:number;
        if( this.getType() === FrameType.CONNECTION_CLOSE ){
            frameType = VLIE.encode(0); 
            bufLength = 1 + 2 + frameType.byteLength + phraseLengthBuffer.byteLength + phraseBuffer.byteLength;
        }
        else
            bufLength = 1 + 2 + phraseLengthBuffer.byteLength + phraseBuffer.byteLength;

        let buf = Buffer.alloc(bufLength);

        let offset = 0;
        buf.writeUInt8(this.getType(), offset++);
        buf.writeUInt16BE(this.errorCode, offset);
        offset += 2;


        if( this.getType() === FrameType.CONNECTION_CLOSE ){
            frameType!.copy(buf, offset);
            offset += frameType!.byteLength;
        }

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
import {Bignum} from '../utilities/bignum';
import {Stream} from "./../quicker/stream";
import {StreamFrame} from './general/stream';
import { PaddingFrame } from './general/padding';


export class FrameFactory {

    public static createStreamFrame(stream: Stream, data: Buffer, fin: boolean, len: boolean, offset?: Bignum) {
        var streamFrame = new StreamFrame(stream.getStreamID(), data);
        streamFrame.setFin(fin);
        if (len) {
            streamFrame.setLen(len);
            streamFrame.setLength(Bignum.fromNumber(data.byteLength));
        }
        if (offset !== undefined) {
            streamFrame.setOff(true);
            streamFrame.setOffset(offset);
        }
        return streamFrame;
    }

    public static createPaddingFrame(paddingSize: number) {
        return new PaddingFrame(paddingSize);
    }
}
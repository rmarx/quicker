import {Bignum} from '../types/bignum';
import {Stream} from "../types/stream";
import {StreamFrame} from './general/stream';
import { PaddingFrame } from './general/padding';


export class FrameFactory {

    public static createStreamFrame(stream: Stream, data: Buffer, fin: boolean, len: boolean, offset?: Bignum) {
        var streamFrame = new StreamFrame(stream.getStreamID(), data);
        streamFrame.setFin(fin);
        if (len) {
            streamFrame.setLength(Bignum.fromNumber(data.byteLength));
        }
        if (offset !== undefined) {
            streamFrame.setOffset(offset);
        }
        return streamFrame;
    }

    public static createPaddingFrame(paddingSize: number) {
        return new PaddingFrame(paddingSize);
    }
}
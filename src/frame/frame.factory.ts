import {StreamBlockedFrame} from './general/stream.blocked';
import {Connection} from '../types/connection';
import {BlockedFrame} from './general/blocked';
import {MaxDataFrame} from './general/max.data';
import {Bignum} from '../types/bignum';
import {Stream} from '../types/stream';
import {StreamFrame} from './general/stream';
import {PaddingFrame} from './general/padding';
import { MaxStreamFrame } from './general/max.stream';


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

    public static createStreamBlocked(stream: Stream): StreamBlockedFrame | undefined {
        if (!stream.getBlockedSent()) {
            stream.setBlockedSent(true);
            return new StreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset());
        }
        return undefined;
    }

    public static createBlocked(connection: Connection): BlockedFrame {
        return new BlockedFrame(connection.getRemoteOffset());
    }

    public static createMaxStreamData(stream: Stream): MaxStreamFrame {
        var newMaxStreamData = stream.getLocalMaxData().multiply(2);
        return new MaxStreamFrame(stream.getStreamID(), newMaxStreamData);
    }

    public static createMaxData(connection: Connection): MaxDataFrame {
        var newMaxData = connection.getLocalMaxData().multiply(2);
        return new MaxDataFrame(newMaxData);
    }
}
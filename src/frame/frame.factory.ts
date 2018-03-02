import {StreamBlockedFrame} from './general/stream.blocked';
import {Connection} from '../types/connection';
import {BlockedFrame} from './general/blocked';
import {MaxDataFrame} from './general/max.data';
import {Bignum} from '../types/bignum';
import {Stream} from '../types/stream';
import {StreamFrame} from './general/stream';
import {PaddingFrame} from './general/padding';
import { MaxStreamFrame } from './general/max.stream';
import { PingFrame, PongFrame } from './general/ping';
import { RstStreamFrame } from './general/rst.stream';
import { ConnectionCloseFrame, ApplicationCloseFrame } from './general/close';


export class FrameFactory {

    public static createStreamFrame(stream: Stream, data: Buffer, fin: boolean, len: boolean, offset?: Bignum): StreamFrame {
        var streamFrame = new StreamFrame(stream.getStreamID(), data);
        streamFrame.setFin(fin);
        if (len) {
            streamFrame.setLength(new Bignum(data.byteLength));
        }
        if (offset !== undefined) {
            streamFrame.setOffset(offset);
        }
        return streamFrame;
    }

    public static createPaddingFrame(paddingSize: number): PaddingFrame {
        return new PaddingFrame(paddingSize);
    }

    public static createStreamBlockedFrame(stream: Stream): StreamBlockedFrame {
        return new StreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset());
    }

    public static createBlockedFrame(connection: Connection): BlockedFrame {
        return new BlockedFrame(connection.getRemoteOffset());
    }

    public static createMaxStreamDataFrame(stream: Stream, newMaxStreamData: Bignum): MaxStreamFrame {
        return new MaxStreamFrame(stream.getStreamID(), newMaxStreamData);
    }

    public static createMaxDataFrame(newMaxData: Bignum): MaxDataFrame {
        return new MaxDataFrame(newMaxData);
    }

    public static createPingFrame(data: Buffer): PingFrame {
        return new PingFrame(data.byteLength, data);
    }

    public static createPongFrame(data: Buffer): PongFrame {
        return new PongFrame(data.byteLength, data);
    }

    public static createRstStreamFrame(stream: Stream, errorCode: number): RstStreamFrame {
        return new RstStreamFrame(stream.getStreamID(), errorCode, stream.getRemoteFinalOffset());
    }

    public static createConnectionCloseFrame(errorCode: number, phrase?: string): ConnectionCloseFrame {
        if (phrase === undefined) {
            phrase = "";
        }
        return new ConnectionCloseFrame(errorCode, phrase);
    }

    public static createApplicationCloseFrame(errorCode: number, phrase?: string): ApplicationCloseFrame {
        if (phrase === undefined) {
            phrase = "";
        }
        return new ApplicationCloseFrame(errorCode, phrase);
    }
}
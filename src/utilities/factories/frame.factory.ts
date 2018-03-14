import {StreamBlockedFrame} from '../../frame/stream.blocked';
import {Connection} from '../../quicker/connection';
import {BlockedFrame} from '../../frame/blocked';
import {MaxDataFrame} from '../../frame/max.data';
import {Bignum} from '../../types/bignum';
import {Stream} from '../../quicker/stream';
import {StreamFrame} from '../../frame/stream';
import {PaddingFrame} from '../../frame/padding';
import { MaxStreamFrame } from '../../frame/max.stream';
import { PingFrame, PongFrame } from '../../frame/ping';
import { RstStreamFrame } from '../../frame/rst.stream';
import { ConnectionCloseFrame, ApplicationCloseFrame } from '../../frame/close';
import { MaxStreamIdFrame } from '../../frame/max.stream.id';
import { StreamIdBlockedFrame } from '../../frame/stream.id.blocked';


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

    public static createStreamIdBlockedFrame(streamId: Bignum): StreamIdBlockedFrame {
        return new StreamIdBlockedFrame(streamId);
    }

    public static createMaxStreamDataFrame(stream: Stream, newMaxStreamData: Bignum): MaxStreamFrame {
        return new MaxStreamFrame(stream.getStreamID(), newMaxStreamData);
    }

    public static createMaxDataFrame(newMaxData: Bignum): MaxDataFrame {
        return new MaxDataFrame(newMaxData);
    }

    public static createMaxStreamIdFrame(newMaxData: Bignum): MaxStreamIdFrame {
        return new MaxStreamIdFrame(newMaxData);
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
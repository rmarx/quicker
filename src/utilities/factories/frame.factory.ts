import {StreamBlockedFrame} from '../../frame/stream.blocked';
import {Connection} from '../../quicker/connection';
import {BlockedFrame} from '../../frame/blocked';
import {MaxDataFrame} from '../../frame/max.data';
import {Bignum} from '../../types/bignum';
import {Stream} from '../../quicker/stream';
import {StreamFrame} from '../../frame/stream';
import {PaddingFrame} from '../../frame/padding';
import { MaxStreamFrame } from '../../frame/max.stream';
import { PingFrame } from '../../frame/ping';
import { RstStreamFrame } from '../../frame/rst.stream';
import { ConnectionCloseFrame, ApplicationCloseFrame } from '../../frame/close';
import { MaxStreamIdFrame } from '../../frame/max.stream.id';
import { StreamIdBlockedFrame } from '../../frame/stream.id.blocked';
import { AckBlock, AckFrame } from '../../frame/ack';
import { ConnectionID } from '../../packet/header/header.properties';
import { NewConnectionIdFrame } from '../../frame/new.connection.id';
import { StopSendingFrame } from '../../frame/stop.sending';
import { PathChallengeFrame, PathResponseFrame } from '../../frame/path';


export class FrameFactory {

    public static createStreamFrame(streamId: Bignum, data: Buffer, fin: boolean, len: boolean, offset?: Bignum): StreamFrame {
        var streamFrame = new StreamFrame(streamId, data);
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

    public static createStreamBlockedFrame(streamId: Bignum, remoteOffset: Bignum): StreamBlockedFrame {
        return new StreamBlockedFrame(streamId, remoteOffset);
    }

    public static createBlockedFrame(remoteOffset: Bignum): BlockedFrame {
        return new BlockedFrame(remoteOffset);
    }

    public static createStreamIdBlockedFrame(streamId: Bignum): StreamIdBlockedFrame {
        return new StreamIdBlockedFrame(streamId);
    }

    public static createMaxStreamDataFrame(streamId: Bignum, newMaxStreamData: Bignum): MaxStreamFrame {
        return new MaxStreamFrame(streamId, newMaxStreamData);
    }

    public static createMaxDataFrame(newMaxData: Bignum): MaxDataFrame {
        return new MaxDataFrame(newMaxData);
    }

    public static createMaxStreamIdFrame(newMaxData: Bignum): MaxStreamIdFrame {
        return new MaxStreamIdFrame(newMaxData);
    }

    public static createPingFrame(): PingFrame {
        return new PingFrame();
    }

    public static createRstStreamFrame(streamId: Bignum, errorCode: number, remoteFinalOffset: Bignum): RstStreamFrame {
        return new RstStreamFrame(streamId, errorCode, remoteFinalOffset);
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

    public static createAckFrame(largestAck: Bignum, ackDelay: Bignum, ackBlockCount: Bignum, firstAckBlock: Bignum, ackBlocks: AckBlock[]): AckFrame {
        return new AckFrame(largestAck, ackDelay, ackBlockCount, firstAckBlock, ackBlocks);
    }

    public static createStopSendingFrame(streamID: Bignum, applicationErrorCode: number): StopSendingFrame {
        return new StopSendingFrame(streamID, applicationErrorCode);
    }

    public static createNewConnectionIdFrame(connectionID: ConnectionID, statelessResetToken: Buffer): NewConnectionIdFrame {
        return new NewConnectionIdFrame(connectionID, statelessResetToken);
    }

    public static createPathChallengeFrame(data: Buffer): PathChallengeFrame {
        return new PathChallengeFrame(data);
    }

    public static createPathResponseFrame(data: Buffer): PathResponseFrame {
        return new PathResponseFrame(data);
    }
}
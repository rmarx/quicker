import { EndpointType } from '../../types/endpoint.type';
import { Constants } from '../constants';
import { HandshakeState } from '../../crypto/qtls';
import { PacketNumber, Version } from '../../packet/header/header.properties';
import { Bignum } from '../../types/bignum';
import { Connection } from '../../quicker/connection';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { ConsoleColor } from './colors';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { BaseFrame, FrameType } from '../../frame/base.frame';
import { PaddingFrame } from '../../frame/padding';
import { RstStreamFrame } from '../../frame/rst.stream';
import { ConnectionCloseFrame, ApplicationCloseFrame } from '../../frame/close';
import { MaxDataFrame } from '../../frame/max.data';
import { MaxStreamFrame } from '../../frame/max.stream';
import { MaxStreamIdFrame } from '../../frame/max.stream.id';
import { PingFrame } from '../../frame/ping';
import { BlockedFrame } from '../../frame/blocked';
import { StreamBlockedFrame } from '../../frame/stream.blocked';
import { StreamIdBlockedFrame } from '../../frame/stream.id.blocked';
import { NewConnectionIdFrame } from '../../frame/new.connection.id';
import { StopSendingFrame } from '../../frame/stop.sending';
import { AckFrame, AckBlock } from '../../frame/ack';
import { StreamFrame } from '../../frame/stream';
import { configure, getLogger, Logger } from 'log4js';
import { TransportParameterType } from '../../crypto/transport.parameters';
import { HeaderType } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';
import { PathChallengeFrame, PathResponseFrame } from '../../frame/path';



export class PacketLogging {

    private static logger: PacketLogging;
    private startOutput: Logger;
    private continuedOutput: Logger;

    public static getInstance(): PacketLogging {
        if (this.logger === undefined) {
            this.logger = new PacketLogging();
        }
        return this.logger;
    }


    private constructor() {
        configure({
            appenders: {
                startOut: {
                    type: Constants.LOG_TYPE,
                    filename: './logs/debug.log',
                    maxLogSize: Constants.MAX_LOG_FILE_SIZE,
                    layout: {
                        type: 'pattern',
                        pattern: '%d %n%m'
                    }
                },
                continuedOut: {
                    type: Constants.LOG_TYPE,
                    filename: './logs/debug.log',
                    maxLogSize: Constants.MAX_LOG_FILE_SIZE,
                    layout: {
                        type: 'pattern',
                        pattern: '%m'
                    }
                }
            },
            categories: {
                start: {
                    appenders: ['startOut'],
                    level: Constants.LOG_LEVEL
                },
                default: {
                    appenders: ['continuedOut'],
                    level: Constants.LOG_LEVEL
                }
            }
        });
        this.startOutput = getLogger("start");
        this.startOutput.level = Constants.LOG_LEVEL;
        this.continuedOutput = getLogger();
        this.continuedOutput.level = Constants.LOG_LEVEL;
    }

    public logIncomingPacket(connection: Connection, basePacket: BasePacket) {
        var log = this.logPackets(connection, basePacket, "RX", ConsoleColor.FgCyan);
        this.startOutput.info(log);
    }

    public logOutgoingPacket(connection: Connection, basePacket: BasePacket) {
        var log = this.logPackets(connection, basePacket, "TX", ConsoleColor.FgRed);
        this.startOutput.info(log);
    }

    private logPackets(connection: Connection, basePacket: BasePacket, direction: string, color: ConsoleColor): string {
        var log = "";
        var connectionID = basePacket.getHeader().getConnectionID();
        var connectionIDString = connectionID === undefined ? "omitted" : connectionID.toString();
        log = this.getSpaces(2) + color + direction + " " + PacketType[basePacket.getPacketType()] + "(0x" + basePacket.getPacketType() + ")" + ConsoleColor.Reset + " CID: 0x" + connectionIDString;
        if (basePacket.getPacketType() !== PacketType.VersionNegotiation) {
            log += color + ", PKN: " + basePacket.getHeader().getPacketNumber().getPacketNumber().toDecimalString() + ConsoleColor.Reset;
        }
        if (basePacket.getHeader().getHeaderType() === HeaderType.LongHeader) {
            var lh: LongHeader = <LongHeader>(basePacket.getHeader());
            log += ", Version: 0x" + lh.getVersion().getVersion().toString();
        }

        switch (basePacket.getPacketType()) {
            case PacketType.Retry:
                break;
            case PacketType.VersionNegotiation:
                var vnPacket: VersionNegotiationPacket = <VersionNegotiationPacket>basePacket;
                log += this.logVersionNegotiationPacket(vnPacket);
                break;
            case PacketType.Initial:
            case PacketType.Handshake:
            case PacketType.Protected0RTT:
            case PacketType.Protected1RTT:
                var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>basePacket;
                log += this.logFrames(connection, baseEncryptedPacket, color);
        }
        return log;
    }

    private logVersionNegotiationPacket(vnPacket: VersionNegotiationPacket): string {
        var log = "";
        vnPacket.getVersions().forEach((version: Version) => {
            log += "\n";
            log += this.getSpaces(4) + "version: 0x" + version.toString() + "\n";
        });
        return log;
    }

    private logFrames(connection: Connection, baseEncryptedPacket: BaseEncryptedPacket, color: ConsoleColor): string {
        var log = "";
        baseEncryptedPacket.getFrames().forEach((baseFrame) => {
            log += "\n";
            log += this.logFrame(connection, baseFrame, color);
        });
        return log;
    }

    public logFrame(connection: Connection, baseFrame: BaseFrame, color: ConsoleColor): string {
        var log = "";
        if (baseFrame.getType() < FrameType.STREAM) {
            log += this.getSpaces(4) + color + FrameType[baseFrame.getType()] + " (0x" + baseFrame.getType().toString(16) + ")" + ConsoleColor.Reset + "\n";
        }
        switch (baseFrame.getType()) {
            case FrameType.PADDING:
                var paddingFrame: PaddingFrame = <PaddingFrame>baseFrame;
                log += this.logPaddingFrame(paddingFrame, color);
                break;
            case FrameType.RST_STREAM:
                var rstStreamFrame: RstStreamFrame = <RstStreamFrame>baseFrame;
                log += this.logRstStreamFrame(rstStreamFrame, color);
                break;
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame: ConnectionCloseFrame = <ConnectionCloseFrame>baseFrame;
                log += this.logConnectionCloseFrame(connectionCloseFrame, color);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame: ApplicationCloseFrame = <ApplicationCloseFrame>baseFrame;
                log += this.logApplicationCloseFrame(applicationCloseFrame, color);
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame: MaxDataFrame = <MaxDataFrame>baseFrame;
                log += this.logMaxDataFrame(maxDataFrame, color);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxStreamFrame: MaxStreamFrame = <MaxStreamFrame>baseFrame;
                log += this.logMaxStreamFrame(maxStreamFrame, color);
                break;
            case FrameType.MAX_STREAM_ID:
                var maxStreamIdFrame: MaxStreamIdFrame = <MaxStreamIdFrame>baseFrame;
                log += this.logMaxStreamIdFrame(maxStreamIdFrame, color);
                break;
            case FrameType.PING:
                // nothing to log
                break;
            case FrameType.BLOCKED:
                var blockedFrame: BlockedFrame = <BlockedFrame>baseFrame;
                log += this.logBlockedFrame(blockedFrame, color);
                break;
            case FrameType.STREAM_BLOCKED:
                var streamBlockedFrame: StreamBlockedFrame = <StreamBlockedFrame>baseFrame;
                log += this.logStreamBlockedFrame(streamBlockedFrame, color);
                break;
            case FrameType.STREAM_ID_BLOCKED:
                var streamIdBlockedFrame: StreamIdBlockedFrame = <StreamIdBlockedFrame>baseFrame;
                log += this.logStreamIdBlockedFrame(streamIdBlockedFrame, color);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame: NewConnectionIdFrame = <NewConnectionIdFrame>baseFrame;
                log += this.logNewConnectionIdFrame(newConnectionIdFrame, color);
                break;
            case FrameType.STOP_SENDING:
                var stopSendingFrame: StopSendingFrame = <StopSendingFrame>baseFrame;
                log += this.logStopSendingFrame(stopSendingFrame, color);
                break;
            case FrameType.ACK:
                var ackFrame: AckFrame = <AckFrame>baseFrame;
                log += this.logAckFrame(connection, ackFrame, color);
                break;
            case FrameType.PATH_CHALLENGE:
                var pathChallengeFrame: PathChallengeFrame = <PathChallengeFrame>baseFrame;
                log += this.logPathChallengeFrame(pathChallengeFrame, color);
                break;
            case FrameType.PATH_RESPONSE:
                var pathResponseFrame: PathResponseFrame = <PathResponseFrame>baseFrame;
                log += this.logPathResponseFrame(pathResponseFrame, color);
                break;
        }
        if (baseFrame.getType() >= FrameType.STREAM) {
            var streamFrame: StreamFrame = <StreamFrame>baseFrame;
            log += this.logStreamFrame(streamFrame, color);
        }
        return log;
    }

    private logPaddingFrame(paddingFrame: PaddingFrame, color: ConsoleColor): string {
        return this.getSpaces(4) + "length= " + paddingFrame.getLength();
    }

    private logRstStreamFrame(rstStreamFrame: RstStreamFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + rstStreamFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Error code= " + rstStreamFrame.getApplicationErrorCode() + "\n";
        log += this.getSpaces(4) + "Final offset= " + rstStreamFrame.getFinalOffset().toDecimalString();
        return log;
    }

    private logConnectionCloseFrame(connectionCloseFrame: ConnectionCloseFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Error code= " + connectionCloseFrame.getErrorCode() + "\n";
        log += this.getSpaces(4) + "Error phrase= " + connectionCloseFrame.getErrorPhrase();
        return log;
    }

    private logApplicationCloseFrame(applicationCloseFrame: ApplicationCloseFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Error code= " + applicationCloseFrame.getErrorCode() + "\n";
        log += this.getSpaces(4) + "Error phrase= " + applicationCloseFrame.getErrorPhrase();
        return log;
    }

    private logMaxDataFrame(maxDataFrame: MaxDataFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Max data=0x" + maxDataFrame.getMaxData().toString();
        return log;
    }

    private logMaxStreamFrame(maxStreamFrame: MaxStreamFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + maxStreamFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Max data=0x" + maxStreamFrame.getMaxData().toString();
        return log;
    }

    private logMaxStreamIdFrame(maxStreamIdFrame: MaxStreamIdFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Max streamID=0x" + maxStreamIdFrame.getMaxStreamId().toString();
        return log;
    }

    private logBlockedFrame(blockedFrame: BlockedFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Blocked offset= " + blockedFrame.getBlockedOffset().toDecimalString();
        return log;
    }

    private logStreamBlockedFrame(streamBlockedFrame: StreamBlockedFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + streamBlockedFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Blocked offset= " + streamBlockedFrame.getBlockedOffset().toDecimalString();
        return log;
    }

    private logStreamIdBlockedFrame(streamIdBlockedFrame: StreamIdBlockedFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + streamIdBlockedFrame.getStreamId().toString();
        return log;
    }

    private logNewConnectionIdFrame(newConnectionIdFrame: NewConnectionIdFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "ConnectionID=0x" + newConnectionIdFrame.getConnectionId().toString() + "\n";
        log += this.getSpaces(4) + "Stateless Reset Token=0x" + newConnectionIdFrame.getStatelessResetToken().toString('hex');
        return log;
    }

    private logStopSendingFrame(stopSendingFrame: StopSendingFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + stopSendingFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Application error code= " + stopSendingFrame.getApplicationErrorCode();
        return log;
    }

    private logAckFrame(connection: Connection, ackFrame: AckFrame, color: ConsoleColor): string {
        var log = "";
        var ackDelayExponent = connection.getLocalTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT);
        var ackDelay = ackFrame.getAckDelay().toNumber() * (2 ** ackDelayExponent);

        log += this.getSpaces(4) + "largest acknowledged=" + ackFrame.getLargestAcknowledged().toDecimalString() + "\n";
        log += this.getSpaces(4) + "ack delay=" + ackDelay + "\n";
        log += this.getSpaces(4) + "ack block count=" + ackFrame.getAckBlockCount().toDecimalString() + "\n";
        log += this.getSpaces(4) + "first ackblock=" + ackFrame.getFirstAckBlock().toDecimalString();
        ackFrame.getAckBlocks().forEach((ackBlock: AckBlock) => {
            log += "\n";
            log += this.getSpaces(6) + "gap=" + ackBlock.getGap().toDecimalString() + ", ackblock=" + ackBlock.getBlock().toDecimalString();
        });
        return log;
    }

    private logPathChallengeFrame(pathChallengeFrame: PathChallengeFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "data=0x" + pathChallengeFrame.getData().toString('hex');
        return log;
    }

    private logPathResponseFrame(pathResponseFrame: PathResponseFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "data=0x" + pathResponseFrame.getData().toString('hex');
        return log;
    }

    private logStreamFrame(streamFrame: StreamFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + color + "STREAM (0x" + streamFrame.getType().toString(16) + ") " + ConsoleColor.Reset + " FIN=" + +streamFrame.getFin() + " LEN=" + +streamFrame.getLen() + " OFF=" + +streamFrame.getOff() + "\n";
        log += this.getSpaces(4) + "StreamID (0x" + streamFrame.getStreamID().toString() + ") length=" + streamFrame.getLength().toDecimalString() + " offset=" + streamFrame.getOffset().toDecimalString();
        if (streamFrame.getStreamID().greaterThan(0)) {
            log += "\n";
            log += this.logData(streamFrame.getData());
        }
        return log;
    }

    public logData(buffer: Buffer): string {
        var log = "";
        for (var i = 0; i < buffer.byteLength; i += 16) {
            if (i > 0)
                log += "\n";
            var size = (i + 16) < buffer.byteLength ? 16 : buffer.byteLength - i;
            var t = Buffer.alloc(size);
            buffer.copy(t, 0, i, i + size);
            var str = t.toString('hex');
            for (var j = 20; j >= 0; j--) {
                if (size === 0) {
                    str += "  ";
                } else {
                    size--;
                }
            }
            str += require('util').inspect(t.toString('utf8'), { showHidden: true, depth: null });
            log += this.getSpaces(6) + str;
        }
        return log;
    }

    private getSpaces(amount: number): string {
        return Array(amount + 1).join(" ");
    }
}
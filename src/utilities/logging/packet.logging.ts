import {EndpointType} from '../../types/endpoint.type';
import {Constants} from '../constants';
import {HandshakeState} from '../../crypto/qtls';
import {PacketNumber, Version} from '../../types/header.properties';
import {Bignum} from '../../types/bignum';
import {Connection} from '../../types/connection';
import {BasePacket, PacketType} from '../../packet/base.packet';
import {ConsoleColor} from './colors';
import {BaseEncryptedPacket} from '../../packet/base.encrypted.packet';
import {BaseFrame, FrameType} from '../../frame/base.frame';
import {PaddingFrame} from '../../frame/general/padding';
import {RstStreamFrame} from '../../frame/general/rst.stream';
import {ConnectionCloseFrame, ApplicationCloseFrame} from '../../frame/general/close';
import {MaxDataFrame} from '../../frame/general/max.data';
import {MaxStreamFrame} from '../../frame/general/max.stream';
import {MaxStreamIdFrame} from '../../frame/general/max.stream.id';
import {PingFrame, PongFrame} from '../../frame/general/ping';
import {BlockedFrame} from '../../frame/general/blocked';
import {StreamBlockedFrame} from '../../frame/general/stream.blocked';
import {StreamIdBlockedFrame} from '../../frame/general/stream.id.blocked';
import {NewConnectionIdFrame} from '../../frame/general/new.connection.id';
import {StopSendingFrame} from '../../frame/general/stop.sending';
import {AckFrame} from '../../frame/general/ack';
import {StreamFrame} from '../../frame/general/stream';
import { configure, getLogger, Logger } from 'log4js';
import {TransportParameterType} from '../../crypto/transport.parameters';
import { HeaderType } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';



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
                    type: 'stdout', layout: {
                        type: 'pattern',
                        pattern: '%d %n%m'
                    }
                },
                continuedOut: {
                    type: 'stdout', layout: {
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
        this.logPackets(connection, basePacket, connection.getRemotePacketNumber(), "RX", ConsoleColor.FgCyan);
    }

    public logOutgoingPacket(connection: Connection, basePacket: BasePacket) {
        this.logPackets(connection, basePacket, connection.getLocalPacketNumber(), "TX", ConsoleColor.FgRed);
    }

    private logPackets(connection: Connection, basePacket: BasePacket, packetNumber: PacketNumber, direction: string, color: ConsoleColor): void {
        var connectionID = basePacket.getHeader().getConnectionID();
        var connectionIDString = connectionID === undefined ? "omitted" : connectionID.toString();
        var format = this.getSpaces(2) + color + "%s %s(0x%s)" + ConsoleColor.Reset + " CID: 0x%s, " + color + "PKN: %s" + ConsoleColor.Reset + " ";
        if (basePacket.getHeader().getHeaderType() === HeaderType.LongHeader) {
            var lh: LongHeader = <LongHeader> (basePacket.getHeader());
            format += "Version: Ox" + lh.getVersion().getVersion().toString();
        }
        this.startOutput.info(format, direction, PacketType[basePacket.getPacketType()], basePacket.getPacketType(), connectionIDString, packetNumber.getPacketNumber().toDecimalString());

        switch (basePacket.getPacketType()) {
            case PacketType.Retry:
                break;
            case PacketType.VersionNegotiation:
                var vnPacket: VersionNegotiationPacket = <VersionNegotiationPacket>basePacket;
                this.logVersionNegotiationPacket(vnPacket);
                break;
            case PacketType.Initial:
            case PacketType.Handshake:
            case PacketType.Protected1RTT:
                var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>basePacket;
                this.logFrames(connection, baseEncryptedPacket, color);
        }
    }

    private logVersionNegotiationPacket(vnPacket: VersionNegotiationPacket): void {
        vnPacket.getVersions().forEach((version: Version) => {
            this.continuedOutput.info(this.getSpaces(4)  + "version: 0x%s", version.toString());
        });
    }

    private logFrames(connection: Connection, baseEncryptedPacket: BaseEncryptedPacket, color: ConsoleColor): void {
        baseEncryptedPacket.getFrames().forEach((baseFrame) => {
            this.logFrame(connection, baseFrame, color);
        });
    }

    private logFrame(connection: Connection, baseFrame: BaseFrame, color: ConsoleColor): void {
        if (baseFrame.getType() < FrameType.STREAM) {
            this.continuedOutput.info(this.getSpaces(4) + color + "%s (0x%s)" + ConsoleColor.Reset, FrameType[baseFrame.getType()], baseFrame.getType().toString(16));
        }
        switch (baseFrame.getType()) {
            case FrameType.PADDING:
                var paddingFrame: PaddingFrame = <PaddingFrame>baseFrame;
                this.logPaddingFrame(paddingFrame, color);
                break;
            case FrameType.RST_STREAM:
                var rstStreamFrame: RstStreamFrame = <RstStreamFrame>baseFrame;
                this.logRstStreamFrame(rstStreamFrame, color);
                break;
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame: ConnectionCloseFrame = <ConnectionCloseFrame>baseFrame;
                this.logConnectionCloseFrame(connectionCloseFrame, color);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame: ApplicationCloseFrame = <ApplicationCloseFrame>baseFrame;
                this.logApplicationCloseFrame(applicationCloseFrame, color);
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame: MaxDataFrame = <MaxDataFrame>baseFrame;
                this.logMaxDataFrame(maxDataFrame, color);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxStreamFrame: MaxStreamFrame = <MaxStreamFrame>baseFrame;
                this.logMaxStreamFrame(maxStreamFrame, color);
                break;
            case FrameType.MAX_STREAM_ID:
                var maxStreamIdFrame: MaxStreamIdFrame = <MaxStreamIdFrame>baseFrame;
                this.logMaxStreamIdFrame(maxStreamIdFrame, color);
                break;
            case FrameType.PING:
                var pingFrame: PingFrame = <PingFrame>baseFrame;
                this.logPingFrame(pingFrame, color);
                break;
            case FrameType.BLOCKED:
                var blockedFrame: BlockedFrame = <BlockedFrame>baseFrame;
                this.logBlockedFrame(blockedFrame, color);
                break;
            case FrameType.STREAM_BLOCKED:
                var streamBlockedFrame: StreamBlockedFrame = <StreamBlockedFrame>baseFrame;
                this.logStreamBlockedFrame(streamBlockedFrame, color);
                break;
            case FrameType.STREAM_ID_BLOCKED:
                var streamIdBlockedFrame: StreamIdBlockedFrame = <StreamIdBlockedFrame>baseFrame;
                this.logStreamIdBlockedFrame(streamIdBlockedFrame, color);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame: NewConnectionIdFrame = <NewConnectionIdFrame>baseFrame;
                this.logNewConnectionIdFrame(newConnectionIdFrame, color);
                break;
            case FrameType.STOP_SENDING:
                var stopSendingFrame: StopSendingFrame = <StopSendingFrame>baseFrame;
                this.logStopSendingFrame(stopSendingFrame, color);
                break;
            case FrameType.PONG:
                var pongFrame: PongFrame = <PongFrame>baseFrame;
                this.logPongFrame(pongFrame, color);
                break;
            case FrameType.ACK:
                var ackFrame: AckFrame = <AckFrame>baseFrame;
                this.logAckFrame(connection, ackFrame, color);
                break;
        }
        if (baseFrame.getType() >= FrameType.STREAM) {
            var streamFrame: StreamFrame = <StreamFrame>baseFrame;
            this.logStreamFrame(streamFrame, color);
        }
    }

    private logPaddingFrame(paddingFrame: PaddingFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "length=%d ", paddingFrame.getLength());
    }

    private logRstStreamFrame(rstStreamFrame: RstStreamFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "StreamID=Ox%s ", rstStreamFrame.getStreamId().toString());
        this.continuedOutput.info(this.getSpaces(4) + "Error code=%d ", rstStreamFrame.getApplicationErrorCode());
        this.continuedOutput.info(this.getSpaces(4) + "Final offset=%s ", rstStreamFrame.getFinalOffset().toDecimalString());
    }

    private logConnectionCloseFrame(connectionCloseFrame: ConnectionCloseFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "Error code=%d ", connectionCloseFrame.getErrorCode());
        this.continuedOutput.info(this.getSpaces(4) + "Error phrase=%s ", connectionCloseFrame.getErrorPhrase());
    }

    private logApplicationCloseFrame(applicationCloseFrame: ApplicationCloseFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "Error code=%d ", applicationCloseFrame.getErrorCode());
        this.continuedOutput.info(this.getSpaces(4) + "Error phrase=%s ", applicationCloseFrame.getErrorPhrase());
    }

    private logMaxDataFrame(maxDataFrame: MaxDataFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "Max data=Ox%s ", maxDataFrame.getMaxData().toString());
    }

    private logMaxStreamFrame(maxStreamFrame: MaxStreamFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "StreamID=Ox%s ", maxStreamFrame.getStreamId().toString());
        this.continuedOutput.info(this.getSpaces(4) + "Max data=Ox%s ", maxStreamFrame.getMaxData().toString());
    }

    private logMaxStreamIdFrame(maxStreamIdFrame: MaxStreamIdFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "Max streamID=Ox%s ", maxStreamIdFrame.getMaxStreamId().toString());
    }

    private logPingFrame(pingFrame: PingFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "length=%d ", pingFrame.getLength());
    }

    private logBlockedFrame(blockedFrame: BlockedFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "Blocked offset=%s ", blockedFrame.getBlockedOffset().toDecimalString());
    }

    private logStreamBlockedFrame(streamBlockedFrame: StreamBlockedFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "StreamID=Ox%s ", streamBlockedFrame.getStreamId().toString());
        this.continuedOutput.info(this.getSpaces(4) + "Blocked offset=%s ", streamBlockedFrame.getBlockedOffset().toDecimalString());
    }

    private logStreamIdBlockedFrame(streamIdBlockedFrame: StreamIdBlockedFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "StreamID=Ox%s ", streamIdBlockedFrame.getStreamId().toString());
    }

    private logNewConnectionIdFrame(newConnectionIdFrame: NewConnectionIdFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "ConnectionID=Ox%s ", newConnectionIdFrame.getConnectionId().toString());
        this.continuedOutput.info(this.getSpaces(4) + "Stateless Reset Token=Ox%s ", newConnectionIdFrame.getStatelessResetToken().toString('hex'));
    }

    private logStopSendingFrame(stopSendingFrame: StopSendingFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "StreamID=Ox%s ", stopSendingFrame.getStreamId().toString());
        this.continuedOutput.info(this.getSpaces(4) + "Application error code=%d ", stopSendingFrame.getApplicationErrorCode());
    }

    private logPongFrame(pongFrame: PongFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + "length=%d ", pongFrame.getLength());
    }

    private logAckFrame(connection: Connection, ackFrame: AckFrame, color: ConsoleColor): void {
        var ackDelayExponent = connection.getLocalTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT);
        var ackDelay = ackFrame.getAckDelay().toNumber() * (2 ** ackDelayExponent);

        this.continuedOutput.info(this.getSpaces(4) + "largest acknowledged=%s", ackFrame.getLargestAcknowledged().toDecimalString());
        this.continuedOutput.info(this.getSpaces(4) + "ack delay=%d", ackDelay);
        this.continuedOutput.info(this.getSpaces(4) + "ack block count=%s", ackFrame.getAckBlockCount().toDecimalString());
        this.continuedOutput.info(this.getSpaces(4) + "first ackblock=%s", ackFrame.getFirstAckBlock().toDecimalString());
    }

    private logStreamFrame(streamFrame: StreamFrame, color: ConsoleColor): void {
        this.continuedOutput.info(this.getSpaces(4) + color + "STREAM (0x%s) " + ConsoleColor.Reset + " FIN=%d LEN=%d OFF=%d", streamFrame.getType().toString(16), streamFrame.getFin(), streamFrame.getLen(), streamFrame.getOff());
        this.continuedOutput.info(this.getSpaces(4) + "StreamID (0x%s) length=%s offset=%s", streamFrame.getStreamID().toDecimalString(), streamFrame.getLength().toDecimalString(), streamFrame.getOffset().toDecimalString());

    }

    private getSpaces(amount: number): string {
        return Array(amount + 1).join(" ");
    }
}
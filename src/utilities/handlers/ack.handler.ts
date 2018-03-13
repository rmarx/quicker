import { Constants } from '../constants';
import { EndpointType } from '../../types/endpoint.type';
import { VLIE } from '../../crypto/vlie';
import { Connection } from '../../quicker/connection';
import { Bignum } from '../../types/bignum';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { AckFrame, AckBlock } from '../../frame/ack';
import { TimeFormat, Time } from '../../types/time';
import { TransportParameterType } from '../../crypto/transport.parameters';
import { Alarm, AlarmEvent } from '../../types/alarm';
import { PacketFactory } from '../factories/packet.factory';
import { BaseFrame, FrameType } from '../../frame/base.frame';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { HandshakeState } from '../../crypto/qtls';


export class AckHandler {
    private receivedPackets: { [key: string]: ReceivedPacket };
    private largestPacketNumber!: Bignum;
    private alarm: Alarm;
    // ack wait in ms
    private static readonly ACK_WAIT = 25;

    public constructor(connection: Connection) {
        this.receivedPackets = {};
        this.alarm = new Alarm();
    }

    public onPacketReceived(connection: Connection, packet: BasePacket, time: Time): void {
        if (packet.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var header = packet.getHeader();
        var pn = connection.getRemotePacketNumber().getAdjustedNumber(header.getPacketNumber(), header.getPacketNumberSize()).getPacketNumber();
        if (this.largestPacketNumber === undefined || pn.greaterThan(this.largestPacketNumber)) {
            this.largestPacketNumber = pn;
        }
        var isAckOnly = true;
        if (packet.getPacketType() !== PacketType.Retry && packet.getPacketType() !== PacketType.VersionNegotiation) {
            var baseEncryptedPacket = <BaseEncryptedPacket>packet;
            if (baseEncryptedPacket.getFrames().length === 0) {
                isAckOnly = false;
            }
            baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
                if (frame.getType() !== FrameType.ACK) {
                    isAckOnly = false;
                }
            });
        } else {
            isAckOnly = false;
        }
        this.receivedPackets[pn.toString()] = { packet: packet, receiveTime: time };
        if (isAckOnly && Object.keys(this.receivedPackets).length === 1) {
            this.alarm.reset();
        } else if (!this.alarm.isRunning()) {
            this.setAlarm(connection);
        }
    }



    public getAckFrame(connection: Connection): AckFrame | undefined {
        this.alarm.reset();
        if (Object.keys(this.receivedPackets).length === 0) {
            return undefined;
        }
        if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            var ackDelayExponent: number = connection.getRemoteTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT);
        } else {
            var ackDelayExponent: number = Constants.DEFAULT_ACK_EXPONENT;
        }

        var ackDelay = Time.now(this.receivedPackets[this.largestPacketNumber.toString()].receiveTime).format(TimeFormat.MicroSeconds);
        ackDelay = ackDelay / (2 ** ackDelayExponent);

        var packetnumbers: Bignum[] = [];
        Object.keys(this.receivedPackets).forEach((key) => packetnumbers.push(new Bignum(Buffer.from(key, 'hex'))));
        packetnumbers.sort((a: Bignum, b: Bignum) => {
            return a.compare(b);
        });
        packetnumbers.reverse();
        this.receivedPackets = {};

        var ackBlockCount = 0;
        var blocks = [];
        var gaps = [];
        blocks.push(0);
        
        for (var i = 1; i < packetnumbers.length; i++) {
            var bn = packetnumbers[i - 1].subtract(packetnumbers[i]);
            if (bn.compare(new Bignum(1)) !== 0) {
                gaps.push(bn.subtract(1).toNumber());
                ackBlockCount++;
                blocks[ackBlockCount] = 1;
            } else {
                blocks[ackBlockCount] = blocks[ackBlockCount] + 1;
            }
        }

        var firstAckBlock = new Bignum(blocks[0]);
        var ackBlocks: AckBlock[] = [];
        for (var i = 1; i < blocks.length; i++) {
            var ackBlock = new AckBlock(new Bignum(gaps[i - 1]), new Bignum(blocks[i]));
            ackBlocks.push(ackBlock);
        }

        var latestPacketNumber = this.largestPacketNumber;
        return new AckFrame(latestPacketNumber, new Bignum(ackDelay), new Bignum(ackBlockCount), firstAckBlock, ackBlocks);
    }

    private setAlarm(connection: Connection) {
        this.alarm.on(AlarmEvent.TIMEOUT, () => {
            var baseFrames: BaseFrame[] = [];
            var ackFrame = this.getAckFrame(connection);
            if (ackFrame !== undefined) {
                baseFrames.push(ackFrame);
                if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
                    var packet: BaseEncryptedPacket = PacketFactory.createShortHeaderPacket(connection, baseFrames);
                } else {
                    var packet: BaseEncryptedPacket = PacketFactory.createHandshakePacket(connection, baseFrames);
                }
                connection.sendPacket(packet, false);
            }
        });
        this.alarm.start(AckHandler.ACK_WAIT);
    }
}

interface ReceivedPacket {
    packet: BasePacket,
    receiveTime: Time
}
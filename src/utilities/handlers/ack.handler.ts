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


interface ReceivedPacket {
    time: Time,
    ackOnly: boolean
}

export class AckHandler {
    private receivedPackets: { [key: string]: ReceivedPacket };
    private largestPacketNumber!: Bignum;
    private alarm: Alarm;
    // ack wait in ms
    private static readonly ACK_WAIT = 15;

    public constructor(connection: Connection) {
        this.receivedPackets = {};
        this.alarm = new Alarm();
    }

    public onPacketAcked(packet: BasePacket) {
        if (packet.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var framePacket = <BaseEncryptedPacket>packet;
        var largestAckedTime = this.receivedPackets[this.largestPacketNumber.toString('hex', 8)];
        framePacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() === FrameType.ACK) {
                var ackFrame = <AckFrame>frame;
                var packetNumbers = this.determineAckedPacketNumbers(ackFrame);
                packetNumbers.forEach((packetNumber: Bignum) => {
                    this.removePacket(packetNumber);
                });
            }
        });
    }

    public onPacketReceived(connection: Connection, packet: BasePacket, time: Time): void {
        if (packet.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var header = packet.getHeader();
        var pn = header.getPacketNumber().getPacketNumber();
        if (this.largestPacketNumber === undefined ||  pn.greaterThan(this.largestPacketNumber)) {
            this.largestPacketNumber = pn;
        }
        var ackOnly = true;
        if (packet.getPacketType() !== PacketType.Retry && packet.getPacketType() !== PacketType.VersionNegotiation) {
            var baseEncryptedPacket = <BaseEncryptedPacket>packet;
            ackOnly = baseEncryptedPacket.isAckOnly();
            console.log("is ack only: " + ackOnly);
        } else {
            ackOnly = false;
        }
        this.receivedPackets[pn.toString('hex', 8)] = {time: time, ackOnly: ackOnly};
        if (this.onlyAckPackets()) {
            this.alarm.reset();
        } else if (!this.alarm.isRunning()) {
            this.setAlarm(connection);
        }
    }



    public getAckFrame(connection: Connection): AckFrame | undefined {
        this.alarm.reset();
        if (Object.keys(this.receivedPackets).length === 0 || this.onlyAckPackets()) {
            return undefined;
        }

        if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            var ackDelayExponent: number = connection.getRemoteTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT);
        } else {
            var ackDelayExponent: number = Constants.DEFAULT_ACK_EXPONENT;
        }

        var ackDelay = Time.now(this.receivedPackets[this.largestPacketNumber.toString('hex', 8)].time).format(TimeFormat.MicroSeconds);
        ackDelay = ackDelay / (2 ** ackDelayExponent);

        var packetnumbers: Bignum[] = [];
        Object.keys(this.receivedPackets).forEach((key) => packetnumbers.push(new Bignum(Buffer.from(key, 'hex'))));
        packetnumbers.sort((a: Bignum, b: Bignum) => {
            return a.compare(b);
        });
        packetnumbers.reverse();
        var latestPacketNumber = this.largestPacketNumber;
        var largestAckedTime = this.receivedPackets[this.largestPacketNumber.toString('hex', 8)];

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
        return new AckFrame(latestPacketNumber, new Bignum(ackDelay), new Bignum(ackBlockCount), firstAckBlock, ackBlocks);
    }

    private setAlarm(connection: Connection) {
        this.alarm.on(AlarmEvent.TIMEOUT, () => {
            var ackFrame = this.getAckFrame(connection);
            if (ackFrame !== undefined) {
                connection.queueFrame(ackFrame);
                connection.sendPackets();
            }

        });
        this.alarm.start(AckHandler.ACK_WAIT);
    }

    private onlyAckPackets(): boolean {
        var ackOnly = true;
        Object.keys(this.receivedPackets).forEach((key: string) => {
            if (!this.receivedPackets[key].ackOnly) {
                ackOnly = false;
            }
        });
        return ackOnly;
    }

    private removePacket(packetNumber: Bignum): void {
        if (this.receivedPackets[packetNumber.toString('hex', 8)] !== undefined) {
            delete this.receivedPackets[packetNumber.toString('hex', 8)];
        }
    }

    private determineAckedPacketNumbers(ackFrame: AckFrame): Bignum[] {
        var packetnumbers: Bignum[] = [];

        var x = ackFrame.getLargestAcknowledged();
        packetnumbers.push(x);
        for (var i = 0; i < ackFrame.getFirstAckBlock().toNumber(); i++) {
            x = x.subtract(1);
            packetnumbers.push(x);
        }

        for (var i = 0; i < ackFrame.getAckBlockCount().toNumber(); i++) {
            for (var j = 0; j < ackFrame.getFirstAckBlock().toNumber(); j++) {
                x = x.subtract(1);
            }
            for (var j = 0; j < ackFrame.getFirstAckBlock().toNumber(); j++) {
                x = x.subtract(1);
                packetnumbers.push(x);
            }
        }
        return packetnumbers;
    }
}
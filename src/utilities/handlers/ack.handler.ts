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
    private receivedPackets: { [key: string]: Time };
    private largestPacketNumber!: Bignum;
    private largestAcked: boolean;
    private isAckOnly: boolean;
    private alarm: Alarm;
    // ack wait in ms
    private static readonly ACK_WAIT = 15;

    public constructor(connection: Connection) {
        this.receivedPackets = {};
        this.alarm = new Alarm();
        this.largestAcked = true;
        this.isAckOnly = true;
    }

    public onPacketReceived(connection: Connection, packet: BasePacket, time: Time): void {
        if (packet.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var header = packet.getHeader();
        var pn = header.getPacketNumber().getPacketNumber();
        if (this.largestPacketNumber === undefined || pn.greaterThan(this.largestPacketNumber)) {
            if (this.largestAcked) {
                this.receivedPackets = {};
            }
            this.largestPacketNumber = pn;
            this.largestAcked = false;
        }
        if (packet.getPacketType() !== PacketType.Retry && packet.getPacketType() !== PacketType.VersionNegotiation) {
            var baseEncryptedPacket = <BaseEncryptedPacket>packet;
            if (baseEncryptedPacket.getFrames().length === 0) {
                this.isAckOnly = false;
            }
            baseEncryptedPacket.getFrames().forEach((frame: BaseFrame) => {
                if (frame.getType() !== FrameType.ACK) {
                    this.isAckOnly = false;
                }
            });
        } else {
            this.isAckOnly = false;
        }
        this.receivedPackets[pn.toString()] = time;
        if (this.isAckOnly && Object.keys(this.receivedPackets).length === 1) {
            this.alarm.reset();
        } else if (!this.alarm.isRunning()) {
            this.setAlarm(connection);
        }
    }



    public getAckFrame(connection: Connection): AckFrame | undefined {
        this.alarm.reset();
        if (Object.keys(this.receivedPackets).length === 0 || (Object.keys(this.receivedPackets).length === 1 && this.largestAcked) || this.isAckOnly) {
            return undefined;
        }

        if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            var ackDelayExponent: number = connection.getRemoteTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT);
        } else {
            var ackDelayExponent: number = Constants.DEFAULT_ACK_EXPONENT;
        }

        var ackDelay = Time.now(this.receivedPackets[this.largestPacketNumber.toString()]).format(TimeFormat.MicroSeconds);
        ackDelay = ackDelay / (2 ** ackDelayExponent);

        var packetnumbers: Bignum[] = [];
        Object.keys(this.receivedPackets).forEach((key) => packetnumbers.push(new Bignum(Buffer.from(key, 'hex'))));
        packetnumbers.sort((a: Bignum, b: Bignum) => {
            return a.compare(b);
        });
        packetnumbers.reverse();
        var latestPacketNumber = this.largestPacketNumber;
        var largestAckedTime = this.receivedPackets[this.largestPacketNumber.toString()];
        this.receivedPackets = {};
        this.receivedPackets[latestPacketNumber.toString()] = largestAckedTime;
        this.largestAcked = true;
        this.isAckOnly = true;

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
            var baseFrames: BaseFrame[] = [];
            var ackFrame = this.getAckFrame(connection);
            if (ackFrame !== undefined) {
                baseFrames.push(ackFrame);
                if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED || 
                    connection.getQuicTLS().getHandshakeState() === HandshakeState.CLIENT_COMPLETED) {
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
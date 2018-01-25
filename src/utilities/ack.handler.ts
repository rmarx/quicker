import { Constants } from './constants';
import { EndpointType } from '../types/endpoint.type';
import { VLIE } from '../crypto/vlie';
import { Connection } from '../types/connection';
import { Bignum } from '../types/bignum';
import { BasePacket, PacketType } from '../packet/base.packet';
import { AckFrame, AckBlock } from '../frame/general/ack';
import { TimeFormat, Time } from './time';
import { TransportParameterType } from '../crypto/transport.parameters';
import { Alarm } from '../loss-detection/alarm';
import { PacketFactory } from '../packet/packet.factory';
import { BaseFrame, FrameType } from '../frame/base.frame';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { HandshakeState } from '../crypto/qtls';


export class AckHandler {
    private receivedPackets: { [key: string]: ReceivedPacket };
    private latestPacketNumber: Bignum;
    private alarm: Alarm;
    // ack wait in ms
    private static readonly ACK_WAIT = 25;

    public constructor(connection: Connection) {
        this.receivedPackets = {};
        this.alarm = new Alarm();
        this.alarm.on("timeout", () => {
            var baseFrames: BaseFrame[] = [];
            var ackFrame = this.getAckFrame(connection);
            if (ackFrame !== undefined) {
                baseFrames.push(ackFrame);
                if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
                    var packet: BaseEncryptedPacket = PacketFactory.createShortHeaderPacket(connection, baseFrames);
                } else {
                    var packet: BaseEncryptedPacket = PacketFactory.createHandshakePacket(connection, baseFrames);
                }
                connection.sendPacket(packet);
            }
        });
    }

    public onPacketReceived(connection: Connection, packet: BasePacket, time: number): void {
        if (packet.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        this.alarm.reset();
        var pn = connection.getRemotePacketNumber().getPacketNumber();
        this.latestPacketNumber = pn;
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
        if (!isAckOnly) {
            this.alarm.set(AckHandler.ACK_WAIT);
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

        var doneTime = Time.now(TimeFormat.MicroSeconds);
        var ackDelay = doneTime - this.receivedPackets[this.latestPacketNumber.toString()].receiveTime;
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
            if (bn === Bignum.fromNumber(0)) {
                gaps.push(bn.toNumber());
                ackBlockCount++;
                blocks[ackBlockCount] = 0;
            } else {
                blocks[ackBlockCount] = blocks[ackBlockCount] + 1;
            }
        }

        var firstAckBlock = Bignum.fromNumber(blocks[0]);
        var ackBlocks: AckBlock[] = [];
        for (var i = 1; i < blocks.length; i++) {
            var ackBlock = new AckBlock(Bignum.fromNumber(gaps[i - 1]), Bignum.fromNumber(blocks[i]));
        }

        var latestPacketNumber = this.latestPacketNumber;
        return new AckFrame(latestPacketNumber, Bignum.fromNumber(ackDelay), Bignum.fromNumber(ackBlockCount), firstAckBlock, ackBlocks);
    }
}

interface ReceivedPacket {
    packet: BasePacket,
    receiveTime: number
}
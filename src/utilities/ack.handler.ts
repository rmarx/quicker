import { VLIE } from '../crypto/vlie';
import { Connection } from '../types/connection';
import { Bignum } from '../types/bignum';
import { BasePacket } from '../packet/base.packet';
import { AckFrame, AckBlock } from '../frame/general/ack';
import { TimeFormat, Time } from './time';
import { TransportParameterType } from '../crypto/transport.parameters';
import { Alarm } from '../loss-detection/alarm';
import { PacketFactory } from '../packet/packet.factory';
import { BaseFrame } from '../frame/base.frame';


export class AckHandler {
    private receivedPackets: { [key: string]: ReceivedPacket };
    private latestPacketNumber: Bignum;
    private alarm: Alarm;
    private connection: Connection;
    // ack wait in ms
    private static readonly ACK_WAIT = 25;

    public constructor(connection: Connection) {
        this.connection = connection;
        this.receivedPackets = {};
        this.alarm = new Alarm();
        this.alarm.on("timeout", () => {
            console.log("on timeout");
            var baseFrames: BaseFrame[] = [];
            baseFrames.push(this.getAckFrame(this.connection));
            PacketFactory.createShortHeaderPacket(this.connection, baseFrames);
        });
    }

    public onPacketReceived(packet: BasePacket, time: number): void {
        console.log("on packet received");
        this.alarm.reset();
        var pn = packet.getHeader().getPacketNumber().getPacketNumber();
        this.latestPacketNumber = pn;
        this.receivedPackets[pn.toString()] = { packet: packet, receiveTime: time };
        this.alarm.set(AckHandler.ACK_WAIT);
    }



    public getAckFrame(connection: Connection): AckFrame {
        var doneTime = Time.now(TimeFormat.MicroSeconds);
        var ackDelay = doneTime - this.receivedPackets[this.latestPacketNumber.toString()].receiveTime;
        ackDelay = ackDelay / (2 ** connection.getServerTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT));
        
        var packetnumbers: Bignum[] = [];
        Object.keys(this.receivedPackets).forEach((key) => packetnumbers.push(new Bignum(Buffer.from(key,'hex'))));
        packetnumbers.sort((a: Bignum, b: Bignum) => {
            return a.compare(b);
        });
        packetnumbers.reverse();
        this.receivedPackets = {};

        var ackBlockCount = 0;
        var blocks = [];
        var gaps = [];
        blocks.push(0);
        for(var i = 1; i < packetnumbers.length; i++) {
            var bn = Bignum.subtract(packetnumbers[i - 1], packetnumbers[i]);
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


        return new AckFrame(this.latestPacketNumber, Bignum.fromNumber(ackDelay), Bignum.fromNumber(ackBlockCount), firstAckBlock, ackBlocks);
    }
}

interface ReceivedPacket {
    packet: BasePacket,
    receiveTime: number
}
import { BasePacket } from '../packet/base.packet';
import { Bignum } from '../types/bignum';
import { Alarm, AlarmEvent } from '../types/alarm';
import { AckFrame } from '../frame/ack';
import { EventEmitter } from 'events';

// SentPackets type:
// Key is the value of the packet number toString
// Value is of type SentPacket
type SentPackets = { [key: string]: SentPacket };

// Type SentPacket with properties used by LossDetection according to 'QUIC Loss Detection and Congestion Control' draft
// sentBytes can be accessed by using the toBuffer method of packet followed by the byteLength property of the buffer object
interface SentPacket {
    // An object of type BasePacket
    packet: BasePacket,
    // Milliseconds sinds epoch
    time: number,
    // Does the packet contain only ack frames or not
    // This value could be a function in BasePacket
    isAckOnly: boolean
};

/**
 * Not used at the moment
 */
export class LossDetection extends EventEmitter {

    ///////////////////////////
    // Constants of interest
    ///////////////////////////

    // Maximum number of tail loss probes before an RTO fires.
    private static readonly MAX_TLP: number = 2;
    // Maximum reordering in packet number space before FACK style loss detection considers a packet lost.
    private static readonly REORDERING_TRESHOLD: number = 2;
    // Maximum reordering in time space before time based loss detection considers a packet lost. In fraction of an RTT.
    private static readonly TIME_REORDERING_FRACTION: number = 1 / 8.0;
    // Whether time based loss detection is in use. If false, uses FACK style loss detection.
    private static readonly USING_TIME_LOSS_DETECTION: boolean = false;
    // Minimum time in the future a tail loss probe alarm may be set for.
    private static readonly MIN_TLP_TIMEOUT: number = 10;
    // Minimum time in the future an RTO alarm may be set for.
    private static readonly MIN_RTO_TIMEOUT: number = 200;
    // The length of the peer’s delayed ack timer.
    private static readonly DELAYED_ACK_TIMEOUT: number = 25;
    // The default RTT used before an RTT sample is taken.
    private static readonly DEFAULT_INITIAL_RTT: number = 100;

    ///////////////////////////
    // Variables of interest
    ///////////////////////////

    // Multi-modal alarm used for loss detection.
    private lossDetectionAlarm!: Alarm;
    // The number of times the handshake packets have been retransmitted without receiving an ack.
    private handshakeCount!: number;
    // The number of times a tail loss probe has been sent without receiving an ack.
    private tlpCount: number;
    // The number of times an rto has been sent without receiving an ack.
    private rtoCount: number;
    // The last packet number sent prior to the first retransmission timeout.
    private largestSentBeforeRto: Bignum;
    // The time the most recent packet was sent.
    private timeOfLastSentPacket: number;
    // The packet number of the most recently sent packet.
    private largestSentPacket: Bignum;
    // The largest packet number acknowledged in an ACK frame.
    private largestAckedPacket: Bignum;
    // The most recent RTT measurement made when receiving an ack for a previously unacked packet.
    private latestRtt!: Bignum;
    // The smoothed RTT of the connection, computed as described in [RFC6298]
    private smoothedRtt: Bignum;
    // The RTT variance, computed as described in [RFC6298]
    private rttVar: Bignum;
    // The minimum RTT seen in the connection, ignoring ack delay.
    private minRtt: Bignum;
    // The maximum ack delay in an incoming ACK frame for this connection. 
    // Excludes ack delays for ack only packets and those that create an RTT sample less than min_rtt.
    private maxAckDelay: Bignum;
    // The largest delta between the largest acked retransmittable packet and a packet containing 
    // retransmittable frames before it’s declared lost.
    private reorderingTreshold: Bignum;
    // The reordering window as a fraction of max(smoothed_rtt, latest_rtt).
    private timeReorderingTreshold: Bignum;
    // The time at which the next packet will be considered lost based on early transmit or 
    // exceeding the reordering window in time.
    private lossTime: Bignum;
    // An association of packet numbers to information about them, including a number field indicating the packet number, 
    // a time field indicating the time a packet was sent, a boolean indicating whether the packet is ack only, 
    // and a bytes field indicating the packet’s size. sent_packets is ordered by packet number, 
    // and packets remain in sent_packets until acknowledged or lost.
    private sentPackets: SentPackets;

    private retransmittablePacketsOutstanding: number;
    private handshakeOutstanding: number;

    public constructor() {
        super();
        this.lossDetectionAlarm = new Alarm();
        this.lossDetectionAlarm.on(AlarmEvent.TIMEOUT, () => {
            this.onLossDetectionAlarm();
        });
        this.tlpCount = 0;
        this.rtoCount = 0;
        if (LossDetection.USING_TIME_LOSS_DETECTION) {
            this.reorderingTreshold = Bignum.infinity();
            this.timeReorderingTreshold = new Bignum(LossDetection.TIME_REORDERING_FRACTION);
        } else {
            this.reorderingTreshold = new Bignum(LossDetection.REORDERING_TRESHOLD);
            this.timeReorderingTreshold = Bignum.infinity();
        }
        this.lossTime = new Bignum(0);
        this.smoothedRtt = new Bignum(0);
        this.rttVar = new Bignum(0);
        this.minRtt = new Bignum(0);
        this.maxAckDelay = new Bignum(0);
        this.largestSentBeforeRto = new Bignum(0);
        this.timeOfLastSentPacket = 0;
        this.largestSentPacket = new Bignum(0);

        this.largestAckedPacket = new Bignum(0);
        this.retransmittablePacketsOutstanding = 0;
        this.handshakeOutstanding = 0;
        this.sentPackets = {};
    }

    /**
     * After any packet is sent, be it a new transmission or a rebundled transmission, the following OnPacketSent function is called
     * @param basePacket The packet that is being sent. From this packet, the packetnumber and the number of bytes sent can be derived.
     * @param isAckOnly A boolean that indicates whether a packet only contains an ACK frame. 
     *                  If true, it is still expected an ack will be received for this packet, but it is not congestion controlled.
     */
    public onPacketSent(basePacket: BasePacket): void {
        this.timeOfLastSentPacket = (new Date()).getTime();
        var packetNumber = basePacket.getHeader().getPacketNumber().getPacketNumber();
        this.largestSentPacket = packetNumber;
        var sentPacket: SentPacket = {
            packet: basePacket,
            time: this.timeOfLastSentPacket,
            isAckOnly: basePacket.isAckOnly()
        };
        if (basePacket.isRetransmittable()) {
            this.retransmittablePacketsOutstanding++;
        }
        if (basePacket.isHandshake()) {
            this.handshakeOutstanding++;
        }
        this.sentPackets[packetNumber.toString('hex', 8)] = sentPacket;
        if (!basePacket.isAckOnly()) {
            // this.congestionControl.onPacketSent(basePacket.toBuffer().byteLength);
            this.setLossDetectionAlarm();
        }
    }

    /**
     * When an ack is received, it may acknowledge 0 or more packets.
     * @param ackFrame The ack frame that is received by the endpoint
     */
    public onAckReceived(ackFrame: AckFrame): void {
        this.largestAckedPacket = ackFrame.getLargestAcknowledged();
        if (this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex', 8)] !== undefined) {
            this.latestRtt = new Bignum(new Date().getTime()).subtract(this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex', 8)].time);
            this.updateRtt(ackFrame);
        }
        this.determineNewlyAckedPackets(ackFrame).forEach((packet: BasePacket) => {
            this.onPacketAcked(packet.getHeader().getPacketNumber().getPacketNumber(), packet);
        });
        this.detectLostPackets(ackFrame.getLargestAcknowledged());
        this.setLossDetectionAlarm();
    }

    private updateRtt(ackFrame: AckFrame) {
        this.minRtt = Bignum.min(this.minRtt, this.latestRtt);
        if (this.latestRtt.subtract(this.minRtt).greaterThan(ackFrame.getAckDelay())) {
            this.latestRtt = this.latestRtt.subtract(ackFrame.getAckDelay());
            if (this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex', 8)].isAckOnly) {
                this.maxAckDelay = Bignum.max(this.maxAckDelay, ackFrame.getAckDelay());
            }
        }
        if (this.smoothedRtt.equals(0)) {
            this.smoothedRtt = this.latestRtt;
            this.rttVar = this.latestRtt.divide(2);
        } else {
            var rttVarSample: Bignum = Bignum.abs(this.smoothedRtt.subtract(this.latestRtt));
            this.rttVar = this.rttVar.multiply(3 / 4).add(rttVarSample.multiply(1 / 4));
            this.smoothedRtt = this.smoothedRtt.multiply(7 / 8).add(this.latestRtt.multiply(1 / 8));
        }
    }



    private determineNewlyAckedPackets(ackFrame: AckFrame): BasePacket[] {
        var ackedPackets: BasePacket[] = [];
        var ackedPacketnumbers = this.determineAckedPacketNumbers(ackFrame);

        console.log(JSON.stringify(ackedPacketnumbers));
        console.log(JSON.stringify(this.sentPackets));
        ackedPacketnumbers.forEach((packetnumber: Bignum) => {
            if (this.sentPackets[packetnumber.toString('hex', 8)] !== undefined) {
                this.onPacketAcked(packetnumber, this.sentPackets[packetnumber.toString('hex', 8)].packet);
            }
        });

        return ackedPackets;
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

    /**
     * When a packet is acked for the first time, the following OnPacketAcked function is called. Note that a single ACK frame may newly acknowledge several packets. 
     * OnPacketAcked must be called once for each of these newly acked packets. OnPacketAcked takes one parameter, acked_packet_number, 
     * which is the packet number of the newly acked packet, and returns a list of packet numbers that are detected as lost.
     * If this is the first acknowledgement following RTO, check if the smallest newly acknowledged packet is one sent by the RTO,
     * and if so, inform congestion control of a verified RTO, similar to F-RTO [RFC5682]
     * @param ackedPacketNumber The packetnumber of the packet that is being acked.
     */
    public onPacketAcked(ackedPacketNumber: Bignum, packet: BasePacket): void {
        this.emit(LossDetectionEvents.PACKETS_ACKED, packet);
        if (this.rtoCount > 0 && ackedPacketNumber.greaterThan(this.largestSentBeforeRto)) {
            this.emit(LossDetectionEvents.RETRANSMISSION_TIMEOUT_VERIFIED);
        }
        this.handshakeCount = 0;
        this.tlpCount = 0;
        this.rtoCount = 0;
        if (this.sentPackets[ackedPacketNumber.toString('hex', 8)].packet.isRetransmittable()) {
            this.retransmittablePacketsOutstanding--;
        }
        if (this.sentPackets[ackedPacketNumber.toString('hex', 8)].packet.isHandshake()) {
            this.handshakeOutstanding--;
        }
        delete this.sentPackets[ackedPacketNumber.toString('hex', 8)];
    }

    public setLossDetectionAlarm(): void {
        // Don't arm the alarm if there are no packets with
        // retransmittable data in flight.
        if (this.retransmittablePacketsOutstanding === 0) {
            this.lossDetectionAlarm.reset();
            return;
        }
        var alarmDuration: Bignum;
        if (this.handshakeOutstanding !== 0) {
            // Handshake retransmission alarm.
            if (this.smoothedRtt.equals(0)) {
                alarmDuration = new Bignum(LossDetection.DEFAULT_INITIAL_RTT * 2);
            } else {
                alarmDuration = this.smoothedRtt.multiply(2);
            }
            alarmDuration = Bignum.max(alarmDuration.add(this.maxAckDelay), LossDetection.MIN_TLP_TIMEOUT);
            alarmDuration = alarmDuration.multiply(Math.pow(2, this.handshakeCount));
        } else if (!this.lossTime.equals(0)) {
            alarmDuration = this.lossTime.subtract(this.timeOfLastSentPacket);
        } else if (this.tlpCount > LossDetection.MAX_TLP) {
            alarmDuration = Bignum.max(this.smoothedRtt.multiply(1.5).add(this.maxAckDelay), LossDetection.MIN_TLP_TIMEOUT);
        } else {
            alarmDuration = this.smoothedRtt.add(this.rttVar.multiply(4)).add(this.maxAckDelay);
            alarmDuration = Bignum.max(alarmDuration, LossDetection.MIN_RTO_TIMEOUT);
            alarmDuration = alarmDuration.multiply(Math.pow(2, this.rtoCount));
        }

        if (!this.lossDetectionAlarm.isRunning()) {
            this.lossDetectionAlarm.on(AlarmEvent.TIMEOUT, () => {
                this.onLossDetectionAlarm();
            });
            this.lossDetectionAlarm.start(alarmDuration.toNumber());
        }
    }

    /**
     * QUIC uses one loss recovery alarm, which when set, can be in one of several modes. 
     * When the alarm fires, the mode determines the action to be performed.
     */
    public onLossDetectionAlarm(): void {
        if (this.handshakeOutstanding > 0) {
            // Handshake retransmission alarm.
            this.retransmitAllHandshakePackets();
            this.handshakeCount++;
        } else if (!this.lossTime.equals(0)) {
            // Early retransmit or Time Loss Detection
            this.detectLostPackets(this.largestAckedPacket);
        } else if (this.tlpCount < LossDetection.MAX_TLP) {
            // Tail Loss Probe.
            this.sendOnePacket();
            this.tlpCount++;
        } else {
            // RTO
            if (this.rtoCount === 0) {
                this.largestSentBeforeRto = this.largestSentPacket;
            }
            this.sendTwoPackets();
            this.rtoCount++;
            this.setLossDetectionAlarm();
        }
    }

    private detectLostPackets(largestAcked: Bignum): void {
        this.lossTime = new Bignum(0);
        var lostPackets: BasePacket[] = [];
        var delayUntilLost = Bignum.infinity();
        if (LossDetection.USING_TIME_LOSS_DETECTION) {
            delayUntilLost = this.timeReorderingTreshold.add(1).multiply(Bignum.max(this.latestRtt, this.smoothedRtt));
        } else if (largestAcked.equals(this.largestSentPacket)) {
            // Early retransmit alarm
            delayUntilLost = Bignum.max(this.latestRtt, this.smoothedRtt).multiply(5 / 4);
        }

        var lostPackets: BasePacket[] = this.determineLostPackets(delayUntilLost);

        // Inform the congestion controller of lost packets and
        // let it decide whether to retransmit immediately.
        if (lostPackets.length > 0) {
            this.emit(LossDetectionEvents.PACKETS_LOST, lostPackets);
            lostPackets.forEach((packet: BasePacket) => {
                delete this.sentPackets[packet.getHeader().getPacketNumber().getPacketNumber().toString('hex', 8)];
            });
        }
    }

    private determineLostPackets(delayUntilLost: Bignum): BasePacket[] {
        var lostPackets: BasePacket[] = [];

        Object.keys(this.sentPackets).forEach((key: string) => {
            var unackedPacketNumber = new Bignum(Buffer.from(key, 'hex'));
            if (unackedPacketNumber.lessThan(this.largestAckedPacket)) {
                var unacked = this.sentPackets[key];
                var timeSinceSent = new Bignum((new Date()).getTime() - unacked.time);
                var delta = this.largestAckedPacket.subtract(unackedPacketNumber);
                if (timeSinceSent.greaterThan(delayUntilLost)) {
                    lostPackets.push(unacked.packet);
                } else if (delta.greaterThan(this.reorderingTreshold)) {
                    lostPackets.push(unacked.packet);
                } else if (this.lossTime.equals(0) && !delayUntilLost.equals(Bignum.infinity())) {
                    this.lossTime = (new Bignum((new Date()).getTime())).add(delayUntilLost).subtract(timeSinceSent);
                }
            }
        });

        return lostPackets;
    }

    private sendOnePacket(): void {
        this.sendPackets(1);
    }

    private sendTwoPackets(): void {
        this.sendPackets(2);
    }

    private sendPackets(amount: number) {
        var sendCount = 0;
        var i = 0;
        var keys = Object.keys(this.sentPackets);
        while (keys.length > i) {
            if (this.sentPackets[keys[i]].packet.isRetransmittable()) {
                this.retransmitPacket(this.sentPackets[keys[i]]);
                sendCount++;
                if (sendCount === amount) {
                    break;
                }
            }
            i++;
        }
    }

    private retransmitAllHandshakePackets(): void {
        Object.keys(this.sentPackets).forEach((key: string) => {
            if (this.sentPackets[key].packet.isHandshake()) {
                this.retransmitPacket(this.sentPackets[key]);
            }
        });
    }

    private retransmitPacket(sentPacket: SentPacket) {
        if (sentPacket.packet.isRetransmittable()) {
            this.emit(LossDetectionEvents.RETRANSMIT_PACKET, sentPacket.packet);
        }
    }
}

export enum LossDetectionEvents {
    RETRANSMISSION_TIMEOUT_VERIFIED = "ld-retransmission-timeout-verified",
    PACKETS_LOST = "ld-packets-lost",
    PACKETS_ACKED = "ld-packets-acked",
    RETRANSMIT_PACKET = "ld-retransmit-packet"
}

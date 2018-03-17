import {BasePacket} from '../packet/base.packet';
import {Bignum} from '../types/bignum';
import {Alarm, AlarmEvent} from '../types/alarm';
import { AckFrame } from '../frame/ack';

/**
 * Not used at the moment
 */
export class LossDetection {

    ///////////////////////////
    // Constants of interest
    ///////////////////////////

    // Maximum number of tail loss probes before an RTO fires.
    private static readonly MAX_TLP: Bignum = new Bignum(2);
    // Maximum reordering in packet number space before FACK style loss detection considers a packet lost.
    private static readonly REORDERING_TRESHOLD: Bignum = new Bignum(2);
    // Maximum reordering in time space before time based loss detection considers a packet lost. In fraction of an RTT.
    private static readonly TIME_REORDERING_FRACTION: Bignum = new Bignum(1/8.0);
    // Whether time based loss detection is in use. If false, uses FACK style loss detection.
    private static readonly USING_TIME_LOSS_DETECTION: boolean = false;
    // Minimum time in the future a tail loss probe alarm may be set for.
    private static readonly MIN_TLP_TIMEOUT: Bignum = new Bignum(10);
    // Minimum time in the future an RTO alarm may be set for.
    private static readonly MIN_RTO_TIMEOUT: Bignum = new Bignum(200);
    // The length of the peer’s delayed ack timer.
    private static readonly DELAYED_ACK_TIMEOUT: Bignum = new Bignum(25);
    // The default RTT used before an RTT sample is taken.
    private static readonly DEFAULT_INITIAL_RTT: Bignum = new Bignum(100);

    ///////////////////////////
    // Variables of interest
    ///////////////////////////

    // Multi-modal alarm used for loss detection.
    private lossDetectionAlarm!: Alarm;
    // The number of times the handshake packets have been retransmitted without receiving an ack.
    private handshakeCount!: Bignum;
    // The number of times a tail loss probe has been sent without receiving an ack.
    private tlpCount: Bignum;
    // The number of times an rto has been sent without receiving an ack.
    private rtoCount: Bignum;
    // The last packet number sent prior to the first retransmission timeout.
    private largestSentBeforeRto: Bignum;
    // The time the most recent packet was sent.
    private timeOfLastSentPacket: Bignum;
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

    public constructor() {
        this.lossDetectionAlarm.on(AlarmEvent.TIMEOUT, () => {
            this.onLossDetectionAlarm();
        });
        this.lossDetectionAlarm.reset();
        this.tlpCount = new Bignum(0);
        this.rtoCount = new Bignum(0);
        if (LossDetection.USING_TIME_LOSS_DETECTION) {
            this.reorderingTreshold = new Bignum(Infinity);
            this.timeReorderingTreshold = LossDetection.TIME_REORDERING_FRACTION;
        } else {
            this.reorderingTreshold = LossDetection.REORDERING_TRESHOLD;
            this.timeReorderingTreshold = new Bignum(Infinity);
        }
        this.lossTime = new Bignum(0);
        this.smoothedRtt = new Bignum(0);
        this.rttVar = new Bignum(0);
        this.minRtt = new Bignum(0);
        this.maxAckDelay = new Bignum(0);
        this.largestSentBeforeRto = new Bignum(0);
        this.timeOfLastSentPacket = new Bignum(0);
        this.largestSentPacket = new Bignum(0);

        this.largestAckedPacket = new Bignum(0);
        this.sentPackets = {};
    }

    /**
     * After any packet is sent, be it a new transmission or a rebundled transmission, the following OnPacketSent function is called
     * @param basePacket The packet that is being sent. From this packet, the packetnumber and the number of bytes sent can be derived.
     * @param isAckOnly A boolean that indicates whether a packet only contains an ACK frame. 
     *                  If true, it is still expected an ack will be received for this packet, but it is not congestion controlled.
     */
    public onPacketSent(basePacket: BasePacket, isAckOnly: boolean): void {
        this.timeOfLastSentPacket = new Bignum((new Date()).getTime());
        var packetNumber = basePacket.getHeader().getPacketNumber().getPacketNumber();
        this.largestSentPacket = packetNumber;
        var sentPacket: SentPacket = {
            packet: basePacket,
            time: this.timeOfLastSentPacket,
            isAckOnly: isAckOnly
        };
        this.sentPackets[packetNumber.toString()] = sentPacket;
        if (!isAckOnly) {
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
        if (this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex')] !== undefined) {
            this.latestRtt = new Bignum(new Date().getTime()).subtract(this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex')].time);
            this.updateRtt(ackFrame);
        }
        this.determineNewlyAckedPackets(ackFrame).forEach((packet: BasePacket) => {
            // probably adjust in some way
            this.onPacketAcked(packet.getHeader().getPacketNumber().getPacketNumber());
        });
        this.detectLostPackets(ackFrame.getLargestAcknowledged());
        this.setLossDetectionAlarm();
    }

    private updateRtt(ackFrame: AckFrame) {
        this.minRtt = Bignum.min(this.minRtt, this.latestRtt);
        if (this.latestRtt.subtract(this.minRtt).greaterThan(ackFrame.getAckDelay())) {
            this.latestRtt = this.latestRtt.subtract(ackFrame.getAckDelay());
            if (this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex')].isAckOnly) {
                this.maxAckDelay = Bignum.max(this.maxAckDelay, ackFrame.getAckDelay());
            }
        }
        if (this.smoothedRtt.equals(0)) {
            this.smoothedRtt = this.latestRtt;
            this.rttVar = this.latestRtt.divide(2);
        } else {
            var rttVarSample: Bignum = Bignum.abs(this.smoothedRtt.subtract(this.latestRtt));
            this.rttVar  = this.rttVar.multiply(3/4).add(rttVarSample.multiply(1/4));
            this.smoothedRtt = this.smoothedRtt.multiply(7/8).add(this.latestRtt.multiply(1/8));
        }
    }

    /**
     * When a packet is acked for the first time, the following OnPacketAcked function is called. Note that a single ACK frame may newly acknowledge several packets. 
     * OnPacketAcked must be called once for each of these newly acked packets. OnPacketAcked takes one parameter, acked_packet_number, 
     * which is the packet number of the newly acked packet, and returns a list of packet numbers that are detected as lost.
     * If this is the first acknowledgement following RTO, check if the smallest newly acknowledged packet is one sent by the RTO,
     * and if so, inform congestion control of a verified RTO, similar to F-RTO [RFC5682]
     * @param ackedPacketNumber The packetnumber of the packet that is being acked.
     */
    public onPacketAcked(ackedPacketNumber: Bignum): void {
        if (this.rtoCount.greaterThan(0) && ackedPacketNumber.greaterThan(this.largestSentBeforeRto)) {
            this.onRetransmissionTimeoutVerified();
        }
        this.handshakeCount = new Bignum(0);
        this.tlpCount = new Bignum(0);
        this.rtoCount = new Bignum(0);
        delete this.sentPackets[ackedPacketNumber.toString('hex')];
    }

    public setLossDetectionAlarm(): void {
        
    }

    /**
     * QUIC uses one loss recovery alarm, which when set, can be in one of several modes. 
     * When the alarm fires, the mode determines the action to be performed.
     */
    public onLossDetectionAlarm(): void {
        throw Error("Not implemented");
    }

    private onRetransmissionTimeoutVerified(): void {
        // TODO
    }

    private detectLostPackets(largestAcked: Bignum): void {
        // TODO
    }

    private determineNewlyAckedPackets(ackFrame: AckFrame): BasePacket[] {
        // TODO
        return [];
    }

}

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
    time: Bignum, 
    // Does the packet contain only ack frames or not
    // This value could be a function in BasePacket
    isAckOnly: boolean
};
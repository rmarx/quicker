import { BasePacket } from '../packet/base.packet';
import { Bignum } from '../types/bignum';
import { Alarm, AlarmEvent } from '../types/alarm';
import { AckFrame } from '../frame/ack';
import { EventEmitter } from 'events';
import { Connection, ConnectionEvent } from '../quicker/connection';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { RTTMeasurement } from './rtt.measurement';

// SentPackets type:
// Key is the value of the packet number toString
// Value is of type SentPacket
type SentPackets = { [key: string]: SentPacket };

// Type SentPacket with properties used by LossDetection according to 'QUIC Loss Detection and Congestion Control' draft
// sentBytes can be accessed by using the toBuffer method of packet followed by the byteLength property of the buffer object
export interface SentPacket {
    // An object of type BasePacket
    packet: BasePacket,
    // Milliseconds sinds epoch
    time: number, // time at which this packet is sent locally, used to calculate RTT
    // Does the packet contain frames that are retransmittable
    isRetransmittable: boolean
};


export class LossDetection extends EventEmitter {

    public DEBUGname = "";

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
    // The time the most recent retransmittable packet was sent.
    private timeOfLastSentRetransmittablePacket: number;
    // The time the most recent packet containing handshake data was sent.
    private timeOfLastSentHandshakePacket: number
    // The packet number of the most recently sent packet.
    private largestSentPacket: Bignum;
    // The largest packet number acknowledged in an ACK frame.
    private largestAckedPacket: Bignum;
    // The largest packet number gap between the
    // largest acked retransmittable packet and an unacknowledged
    // retransmittable packet before it is declared lost.
    private reorderingTreshold: Bignum;
    // The reordering window as a fraction of max(smoothed_rtt, latest_rtt).
    private timeReorderingTreshold: Bignum;
    // The time at which the next packet will be considered lost based on early transmit or 
    // exceeding the reordering window in time.
    private lossTime: number;
    // An association of packet numbers to information about them, including a number field indicating the packet number, 
    // a time field indicating the time a packet was sent, a boolean indicating whether the packet is ack only, 
    // and a bytes field indicating the packet’s size. sent_packets is ordered by packet number, 
    // and packets remain in sent_packets until acknowledged or lost.
    private sentPackets: SentPackets;

    private retransmittablePacketsOutstanding: number;
    private handshakeOutstanding: number;

    private rttMeasurer: RTTMeasurement;

    public constructor(rttMeasurer: RTTMeasurement, connection: Connection) {
        super();
        this.rttMeasurer = rttMeasurer;
        this.lossDetectionAlarm = new Alarm();
        this.tlpCount = 0;
        this.rtoCount = 0;
        if (LossDetection.USING_TIME_LOSS_DETECTION) {
            this.reorderingTreshold = Bignum.infinity();
            this.timeReorderingTreshold = new Bignum(LossDetection.TIME_REORDERING_FRACTION);
        } else {
            this.reorderingTreshold = new Bignum(LossDetection.REORDERING_TRESHOLD);
            this.timeReorderingTreshold = Bignum.infinity();
        }
        this.lossTime = 0;
        this.largestSentBeforeRto = new Bignum(0);
        this.timeOfLastSentRetransmittablePacket = 0;
        this.timeOfLastSentHandshakePacket = 0;
        this.largestSentPacket = new Bignum(0);

        this.largestAckedPacket = new Bignum(0);
        this.retransmittablePacketsOutstanding = 0;
        this.handshakeOutstanding = 0;
        this.handshakeCount = 0;
        this.sentPackets = {};

        //this.hookEvents(connection);
    }

    /*
    private hookEvents(connection: Connection) {
        connection.on(ConnectionEvent.PACKET_SENT, (packet: BasePacket) => {
            ROBIN: TODO: begin hier
            // need to filter on crypto context here (or maybe in connection? but then we can't use events anymore?) FUCK ME FREDDY
            this.onPacketSent(packet);
        });
    }
    */

    /**
     * After any packet is sent, be it a new transmission or a rebundled transmission, the following OnPacketSent function is called
     * @param basePacket The packet that is being sent. From this packet, the packetnumber and the number of bytes sent can be derived.
     */
    public onPacketSent(basePacket: BasePacket): void {
        var currentTime = (new Date()).getTime();
        var packetNumber = basePacket.getHeader().getPacketNumber()!.getValue();
        this.largestSentPacket = packetNumber;

        var sentPacket: SentPacket = {
            packet: basePacket,
            time: currentTime,
            isRetransmittable: basePacket.isRetransmittable()
        };
        if (basePacket.isRetransmittable()) {
            this.retransmittablePacketsOutstanding++;
            this.timeOfLastSentRetransmittablePacket = currentTime;
            if (basePacket.isHandshake()) {
                this.handshakeOutstanding++;
                this.timeOfLastSentHandshakePacket = currentTime;
            }
            // this.congestionControl.onPacketSent(basePacket.toBuffer().byteLength);
            this.setLossDetectionAlarm();
        }

        let packet = this.sentPackets[packetNumber.toString('hex', 8)];
        if( packet !== undefined ){
            VerboseLogging.error(this.DEBUGname + " xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
            VerboseLogging.error(this.DEBUGname + " Packet was already in sentPackets buffer! cannot add twice, error!" + packetNumber.toNumber() + " -> packet type=" + packet.packet.getHeader().getPacketType());
            VerboseLogging.error(this.DEBUGname + " xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
        }
        else{
            VerboseLogging.debug(this.DEBUGname + " loss:onPacketSent : adding packet " +  packetNumber.toNumber() + ", is retransmittable=" + basePacket.isRetransmittable() );

            this.sentPackets[packetNumber.toString('hex', 8)] = sentPacket;
        }
    }

    private updateRtt(ackFrame: AckFrame) {

        let largestAcknowledgedPacket = this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex', 8)];

         // check if we have not yet received an ACK for the largest acknowledge packet (then it would have been removed from this.sentPackets)
         // we could receive a duplicate ACK here, for which we don't want to update our RTT estimates
        if( largestAcknowledgedPacket !== undefined ){
            this.rttMeasurer.updateRTT(ackFrame, largestAcknowledgedPacket);
        }
        else
            VerboseLogging.info(this.DEBUGname + " LossDetection:updateRtt : not actually updating RTT because largestAcknowledgedPacket was previously acknowledged in a different ACK frame or it was an ACK-only frame");

    }



    /**
     * When an ack is received, it may acknowledge 0 or more packets.
     * @param ackFrame The ack frame that is received by this endpoint
     */
    public onAckReceived(ackFrame: AckFrame): void {

        VerboseLogging.info(this.DEBUGname + " Loss:onAckReceived AckFrame is acking " + ackFrame.determineAckedPacketNumbers().map((val, idx, arr) => val.toNumber()).join(","));
        this.largestAckedPacket = ackFrame.getLargestAcknowledged();
        /*
        if (this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex', 8)] !== undefined) {
            this.latestRtt = new Bignum(new Date().getTime()).subtract(this.sentPackets[ackFrame.getLargestAcknowledged().toString('hex', 8)].time);
            this.updateRtt(ackFrame);
        }
        */

        this.updateRtt(ackFrame);

        this.determineNewlyAckedPackets(ackFrame).forEach((sentPacket: BasePacket) => {
            this.onSentPacketAcked(sentPacket);
        });
        this.detectLostPackets(ackFrame.getLargestAcknowledged());
        this.setLossDetectionAlarm();
    }

    // reads the packet numbers from a received ack frame
    // those packet numbers correspond to packets we have sent, that are (probably) in this.sentPackets (could have been removed by receiving a previous ACK)
    // this method transforms the packet numbers to actual packet object references of sent packets so they can be removed from the list
    private determineNewlyAckedPackets(receivedAckFrame: AckFrame): BasePacket[] {
        var ackedPackets: BasePacket[] = [];
        var ackedPacketnumbers = receivedAckFrame.determineAckedPacketNumbers();

        ackedPacketnumbers.forEach((packetnumber: Bignum) => {
            //console.log("Loss:determineNewlyAckedPackets : looking for sent packet " + packetnumber.toNumber());
            let foundPacket = this.sentPackets[packetnumber.toString('hex', 8)];
            if (foundPacket !== undefined) {
                //console.log("Loss:determineNewlyAckedPackets : Was found " + packetnumber.toNumber());
                ackedPackets.push( foundPacket.packet );
            }
            //else{
                //console.log("Loss:determineNewlyAckedPackets : COULD NOT FIND, WAS ACKED EARLIER? " + packetnumber.toNumber() + " // " + Object.keys(this.sentPackets).length);
                //console.log(this.sentPackets);
            //}

        });

        return ackedPackets;
    }

    /**
     * When a sent packet is ACKed by the receiver for the first time, onSentPacketAcked is called. 
     * Note that a single received ACK frame may newly acknowledge several sent packets. 
     * onSentPacketAcked must be called once for each of these newly acked packets. 
     * OnPacketAcked takes one parameter, acked_packet_number returns a list of packet numbers that are detected as lost.
     * If this is the first acknowledgement following RTO, check if the smallest newly acknowledged packet is one sent by the RTO,
     * and if so, inform congestion control of a verified RTO, similar to F-RTO [RFC5682]
     * @param sentPacket A reference to one of the sentPackets that is being acked in a received ACK frame
     */
    private onSentPacketAcked(sentPacket: BasePacket): void {

        let ackedPacketNumber: Bignum = sentPacket.getHeader().getPacketNumber()!.getValue();
        VerboseLogging.info(this.DEBUGname + " loss:onSentPacketAcked called for nr " + ackedPacketNumber.toNumber() + ", is retransmittable=" + this.sentPackets[ackedPacketNumber.toString('hex', 8)].packet.isRetransmittable());

        // TODO: move this to the end of this function? 
        // inform ack handler so it can update internal state, congestion control so it can update bytes-in-flight etc.
        // TODO: call ackhandler and congestion control directly instead of using events? makes code flow clearer 
        this.emit(LossDetectionEvents.PACKET_ACKED, sentPacket);

        if (this.rtoCount > 0 && ackedPacketNumber.greaterThan(this.largestSentBeforeRto)) {
            this.emit(LossDetectionEvents.RETRANSMISSION_TIMEOUT_VERIFIED);
        }
        this.handshakeCount = 0;
        this.tlpCount = 0;
        this.rtoCount = 0;
        
        this.removeFromSentPackets( ackedPacketNumber );
    }

    private removeFromSentPackets( packetNumber:Bignum ){

        let packet = this.sentPackets[packetNumber.toString('hex', 8)];
        if( !packet ){
            VerboseLogging.error("LossDetection:removeFromSentPackets : packet not in sentPackets " + packetNumber.toString('hex', 8) + ". SHOULD NOT HAPPEN! added this because it crashes our server, no idea yet what causes it");
            return;
        }

        if (this.sentPackets[packetNumber.toString('hex', 8)].packet.isRetransmittable()) {
            this.retransmittablePacketsOutstanding--;
        }
        if (this.sentPackets[packetNumber.toString('hex', 8)].packet.isHandshake()) {
            this.handshakeOutstanding--;
        }
        delete this.sentPackets[packetNumber.toString('hex', 8)];
    }

    public setLossDetectionAlarm(): void {
        // Don't arm the alarm if there are no packets with retransmittable data in flight.
        // TODO: replace retransmittablePacketsOutstanding by bytesInFlight
        if (this.retransmittablePacketsOutstanding === 0) {
            this.lossDetectionAlarm.reset();
            VerboseLogging.info(this.DEBUGname + " LossDetection:setLossDetectionAlarm : no outstanding retransmittable packets, disabling loss alarm for now");
            return;
        }
        else
            VerboseLogging.debug(this.DEBUGname + " LossDetection:setLossDetectionAlarm : " + this.retransmittablePacketsOutstanding + " outstanding retransmittable packets" );
        
        var alarmDuration: number;
        var time: number = this.timeOfLastSentRetransmittablePacket;
        if (this.handshakeOutstanding !== 0) {
            // Handshake retransmission alarm.
            if (this.rttMeasurer.smoothedRtt == 0) {
                alarmDuration = LossDetection.DEFAULT_INITIAL_RTT * 2;
            } else {
                alarmDuration = this.rttMeasurer.smoothedRtt * 2;
            }
            //alarmDuration = Bignum.max(alarmDuration.add(this.rttMeasurer.maxAckDelay), LossDetection.MIN_TLP_TIMEOUT);
            alarmDuration = Math.max( alarmDuration + this.rttMeasurer.maxAckDelay, LossDetection.MIN_TLP_TIMEOUT);
            var pw = Math.pow(2, this.handshakeCount);
            alarmDuration = alarmDuration * pw;
            time = this.timeOfLastSentHandshakePacket;
            VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: handshake mode " + alarmDuration );
        } else if (this.lossTime != 0) {
            // Early retansmit timer or time loss detection
            alarmDuration = this.lossTime - this.timeOfLastSentRetransmittablePacket;
            VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: early retransmit " + alarmDuration);
        } else {
            // RTO or TLP alarm
            //Calculate RTO duration
            /*
            alarmDuration = this.rttMeasurer.smoothedRtt.add(this.rttMeasurer.rttVar.multiply(4)).add(this.rttMeasurer.maxAckDelay);
            alarmDuration = Bignum.max(alarmDuration, LossDetection.MIN_RTO_TIMEOUT);
            alarmDuration = alarmDuration.multiply(Math.pow(2, this.rtoCount));
            */
           alarmDuration = this.rttMeasurer.smoothedRtt + this.rttMeasurer.rttVar * 4 + this.rttMeasurer.maxAckDelay;
           alarmDuration = Math.max(alarmDuration, LossDetection.MIN_RTO_TIMEOUT);
           alarmDuration = alarmDuration * Math.pow(2, this.rtoCount);

            if (this.tlpCount < LossDetection.MAX_TLP) {
                // Tail Loss Probe
                /*
                var tlpAlarmDuration = Bignum.max(this.rttMeasurer.maxAckDelay.add(this.rttMeasurer.smoothedRtt.multiply(1.5)), LossDetection.MIN_TLP_TIMEOUT);
                alarmDuration = Bignum.min(tlpAlarmDuration, alarmDuration);
                */
                let tlpDuration = Math.max( this.rttMeasurer.maxAckDelay + this.rttMeasurer.smoothedRtt * 1.5, LossDetection.MIN_TLP_TIMEOUT);
                alarmDuration = Math.min( tlpDuration, alarmDuration );
                VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: TLP " + alarmDuration);
            }
            else
                VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: RTO " + alarmDuration);
        }

        if (!this.lossDetectionAlarm.isRunning()) {
            this.lossDetectionAlarm.on(AlarmEvent.TIMEOUT, (timePassed:number) => {
                VerboseLogging.debug(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// LossDetection: alarm fired  //////////////////////////////// ");
                VerboseLogging.info(this.DEBUGname + " LossDetection:setLossDetectionAlarm timeout alarm fired after " + timePassed + "ms");
                this.lossDetectionAlarm.reset();
                this.onLossDetectionAlarm();
                VerboseLogging.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<////////////////////////////// LossDetection: done handling alarm //////////////////////////////// ");
            });
            this.lossDetectionAlarm.start(alarmDuration);
        }
    }

    /**
     * QUIC uses one loss recovery alarm, which when set, can be in one of several modes. 
     * When the alarm fires, the mode determines the action to be performed.
     */
    public onLossDetectionAlarm(): void {
        if (this.handshakeOutstanding > 0) {
            VerboseLogging.info(this.DEBUGname + " LossDetection:onLossDetectionAlarm Handshake");
            // Handshake retransmission alarm.
            this.retransmitAllUnackedHandshakeData();
            this.handshakeCount++;
        } else if (this.lossTime != 0) {
            // Early retransmit or Time Loss Detection
            VerboseLogging.info(this.DEBUGname + " LossDetection:onLossDetectionAlarm Early Retransmit or time-based");
            this.detectLostPackets(this.largestAckedPacket);
        } else if (this.tlpCount < LossDetection.MAX_TLP) {
            // Tail Loss Probe.
            VerboseLogging.info(this.DEBUGname + " LossDetection:onLossDetectionAlarm TLP, sendOne");
            this.sendOnePacket();
            this.tlpCount++;
        } else {
            // RTO
            VerboseLogging.info(this.DEBUGname + " LossDetection:onLossDetectionAlarm RTO, sendTwo");
            if (this.rtoCount === 0) {
                this.largestSentBeforeRto = this.largestSentPacket;
            }
            this.sendTwoPackets();
            this.rtoCount++;
        }
        this.setLossDetectionAlarm();
    }

    private detectLostPackets(largestAcked: Bignum): void {
        this.lossTime = 0;
        var lostPackets: BasePacket[] = [];
        let delayUntilLost:number = Number.MAX_VALUE;

        if (LossDetection.USING_TIME_LOSS_DETECTION) {
            //delayUntilLost = this.timeReorderingTreshold.add(1).multiply(Bignum.max(this.rttMeasurer.latestRtt, this.rttMeasurer.smoothedRtt));
            delayUntilLost = (this.timeReorderingTreshold.toNumber() + 1) * Math.max(this.rttMeasurer.latestRtt, this.rttMeasurer.smoothedRtt);
        } 
        else if (largestAcked.equals(this.largestSentPacket)) {
            // Early retransmit alarm
            //delayUntilLost = Bignum.max(this.rttMeasurer.latestRtt, this.rttMeasurer.smoothedRtt).multiply(5 / 4);
            delayUntilLost = Math.max( this.rttMeasurer.latestRtt, this.rttMeasurer.smoothedRtt ) * 1.25;
        }

        var lostPackets: BasePacket[] = this.determineLostPackets(delayUntilLost);
        // Inform the congestion controller of lost packets and
        // let it decide whether to retransmit immediately.
        if (lostPackets.length > 0) {
            this.emit(LossDetectionEvents.PACKETS_LOST, lostPackets);
            lostPackets.forEach((packet: BasePacket) => {
                var sentPacket = this.sentPackets[packet.getHeader().getPacketNumber()!.getValue().toString('hex', 8)];
                if (sentPacket !== undefined && sentPacket.packet.isHandshake()) {
                    this.handshakeOutstanding--;
                }

                this.retransmitPacket(packet); // TODO: maybe this should be handled in the CC, like it says before, but it wasn't being done, and other retransmit logic is on Connection, so do that for this case too
            });
        }
    }

    private determineLostPackets(delayUntilLost: number): BasePacket[] {
        var lostPackets: BasePacket[] = [];

        Object.keys(this.sentPackets).forEach((key: string) => {
            var unackedPacketNumber = new Bignum(Buffer.from(key, 'hex'));
            if (unackedPacketNumber.lessThan(this.largestAckedPacket)) {
                var unacked = this.sentPackets[key];
                let timeSinceSent:number = (new Date()).getTime() - unacked.time;
                
                var delta = this.largestAckedPacket.subtract(unackedPacketNumber);
                if (timeSinceSent > delayUntilLost || delta.greaterThan(this.reorderingTreshold)) {
                    //delete this.sentPackets[unacked.packet.getHeader().getPacketNumber().getValue().toString('hex', 8)];
                    this.removeFromSentPackets(unacked.packet.getHeader().getPacketNumber()!.getValue());
                    if (unacked.packet.isRetransmittable()) {
                        lostPackets.push(unacked.packet);
                    }
                } else if (delta.greaterThan(this.reorderingTreshold)) {
                    // TODO: FIXME: added this because we will retransmit this packet in detectLostPackets, but that's probably not the best thing! 
                    this.removeFromSentPackets(unacked.packet.getHeader().getPacketNumber()!.getValue());
                    lostPackets.push(unacked.packet);
                } else if (this.lossTime == 0 && delayUntilLost != Number.MAX_VALUE) {
                    //this.lossTime = (new Bignum((new Date()).getTime())).add(delayUntilLost).subtract(timeSinceSent);
                    this.lossTime = (new Date()).getTime() + delayUntilLost - timeSinceSent;
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
                
                // remove first, because retransmitPacket can change the PacketNumber, and we wouldn't find it in our sentPackets array anymore
                let packet = this.sentPackets[keys[i]];
                this.removeFromSentPackets( this.sentPackets[keys[i]].packet.getHeader().getPacketNumber()!.getValue() );
                this.retransmitPacket(packet);
                //delete this.sentPackets[keys[i]];
                
                sendCount++;
                if (sendCount === amount) {
                    break;
                }
            }
            i++;
        }
    }

    private retransmitAllUnackedHandshakeData(): void {
        Object.keys(this.sentPackets).forEach((key: string) => {
            if (this.sentPackets[key].packet.isHandshake()) {
                //delete this.sentPackets[key];
                // remove first, because retransmitPacket can change the PacketNumber, and we wouldn't find it in our sentPackets array anymore
                let packet = this.sentPackets[key];
                this.removeFromSentPackets( this.sentPackets[key].packet.getHeader().getPacketNumber()!.getValue() );
                this.retransmitPacket(packet);
            }
        });
    }

    private retransmitPacket(packet: SentPacket):void;
    private retransmitPacket(packet: BasePacket):void;
    private retransmitPacket(packet:any):void {
        let p:BasePacket;
        if( packet instanceof BasePacket )
            p = packet;
        else
            p = packet.packet;

        if (p.isRetransmittable()) {
            this.emit(LossDetectionEvents.RETRANSMIT_PACKET, p);
        }
    }

    public reset() {
        this.lossDetectionAlarm.reset();
        this.sentPackets = {};
    }
}

export enum LossDetectionEvents {
    RETRANSMISSION_TIMEOUT_VERIFIED = "ld-retransmission-timeout-verified",
    PACKETS_LOST = "ld-packets-lost",
    PACKET_ACKED = "ld-packet-acked",
    RETRANSMIT_PACKET = "ld-retransmit-packet"
}

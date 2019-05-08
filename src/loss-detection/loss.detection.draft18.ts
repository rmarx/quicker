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
    isRetransmittable: boolean,

    inFlight : boolean
};


export class QuicLossDetection extends EventEmitter {

    public DEBUGname = "";

    ///////////////////////////
    // Constants of interest
    ///////////////////////////

    // Maximum reordering in packets before packet threshold loss detection considers a packet lost
    public static readonly kPacketThreshold: number = 3;
    // Maximum reordering in time before time threshold loss detection considers a packet lost.  Specified as an RTT multiplier
    public static readonly kTimeThreshold: number = 9.0 / 8.0;
    // Timer granularity.  In ms
    public static readonly kGranularity : number = 50;
    // The default RTT used before an RTT sample is taken. In ms.
    public static readonly kInitialRTT: number = 100;

    ///////////////////////////
    // Variables of interest
    ///////////////////////////

    // Multi-modal alarm used for loss detection.
    private lossDetectionAlarm!: Alarm;
    // The number of times the crypto packets have been retransmitted without receiving an ack.
    private cryptoCount!: number;
    // The number of times a PTO has been sent without receiving an ack.
    private ptoCount: number;
    // The time the most recent ack-eliciting packet was sent.
    private timeOfLastSentAckElicitingPacket: number;
    // The time the most recent packet containing handshake data was sent.
    private timeOfLastSentCryptoPacket: number
    // The packet number of the most recently sent packet.
    private largestSentPacket: Bignum;
    // The largest packet number acknowledged in an ACK frame.
    private largestAckedPacket: Bignum;
    // The time at which the next packet will be considered lost based on early transmit or 
    // exceeding the reordering window in time.
    private lossTime: number;
    // An association of packet numbers to information about them, including a number field indicating the packet number, 
    // a time field indicating the time a packet was sent, a boolean indicating whether the packet is ack only, 
    // and a bytes field indicating the packet’s size. sent_packets is ordered by packet number, 
    // and packets remain in sent_packets until acknowledged or lost.
    private sentPackets: SentPackets;

    private ackElicitingPacketsOutstanding: number;
    private cryptoOutstanding: number;

    private rttMeasurer: RTTMeasurement;

    public constructor(rttMeasurer: RTTMeasurement, connection: Connection) {
        super();
        this.lossDetectionAlarm = new Alarm();
        this.cryptoCount = 0;
        this.ptoCount = 0;
        
        this.rttMeasurer = rttMeasurer;
        this.lossTime = 0;
        this.timeOfLastSentAckElicitingPacket = 0;
        this.timeOfLastSentCryptoPacket = 0;
        this.largestSentPacket = new Bignum(0);

        this.largestAckedPacket = new Bignum(0);

        this.ackElicitingPacketsOutstanding = 0;
        this.cryptoOutstanding = 0;
        this.sentPackets = {};
    }

 

    /**
     * After any packet is sent, be it a new transmission or a rebundled transmission, the following OnPacketSent function is called
     * @param basePacket The packet that is being sent. From this packet, the packetnumber and the number of bytes sent can be derived.
     */
    public onPacketSent(basePacket: BasePacket): void {
        var currentTime = (new Date()).getTime();
        var packetNumber = basePacket.getHeader().getPacketNumber().getValue();
        this.largestSentPacket = packetNumber;

        var sentPacket: SentPacket = {
            packet: basePacket,
            time: currentTime,
            isRetransmittable: basePacket.isRetransmittable(),
            inFlight: true
        };
        
        //TODO should be in_flight , draft-17 has isretransmittable/ack eliciting
        if (basePacket.isRetransmittable()) {
            this.ackElicitingPacketsOutstanding++;
            this.timeOfLastSentAckElicitingPacket = currentTime;
            if (basePacket.isHandshake()) {
                this.cryptoOutstanding++;
                this.timeOfLastSentCryptoPacket = currentTime;
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

        // Process ECN information if present.	
        //TODO: fill this in when detecting ecn in acks is possible.
       /* if (ACK frame contains ECN information){	
            this.emit(LossDetectionEvents.ECN_ACK, ackFrame)
        }*/

        this.determineNewlyAckedPackets(ackFrame).forEach((sentPacket: BasePacket) => {
            this.onSentPacketAcked(sentPacket);
        });
        this.detectLostPackets(ackFrame.getLargestAcknowledged());


        this.cryptoCount = 0;
        this.ptoCount = 0;

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

        let ackedPacketNumber: Bignum = sentPacket.getHeader().getPacketNumber().getValue();
        VerboseLogging.error(this.DEBUGname + " loss:onSentPacketAcked called for nr " + ackedPacketNumber.toNumber() + ", is retransmittable=" + this.sentPackets[ackedPacketNumber.toString('hex', 8)].packet.isRetransmittable());

        // TODO: move this to the end of this function? 
        // inform ack handler so it can update internal state, congestion control so it can update bytes-in-flight etc.
        // TODO: call ackhandler and congestion control directly instead of using events? makes code flow clearer 
        if(sentPacket.isRetransmittable())
            this.emit(QuicLossDetectionEvents.PACKET_ACKED, sentPacket);
        
        this.removeFromSentPackets( ackedPacketNumber );
    }



    private removeFromSentPackets( packetNumber:Bignum ){

        let packet = this.sentPackets[packetNumber.toString('hex', 8)];
        if( !packet ){
            VerboseLogging.error("LossDetection:removeFromSentPackets : packet not in sentPackets " + packetNumber.toString('hex', 8) + ". SHOULD NOT HAPPEN! added this because it crashes our server, no idea yet what causes it");
            return;
        }

        if (this.sentPackets[packetNumber.toString('hex', 8)].packet.isRetransmittable()) {
            this.ackElicitingPacketsOutstanding--;
        }
        if (this.sentPackets[packetNumber.toString('hex', 8)].packet.isHandshake()) {
            this.cryptoOutstanding--;
        }
        delete this.sentPackets[packetNumber.toString('hex', 8)];
    }



    public setLossDetectionAlarm(): void {
        // Don't arm the alarm if there are no packets with retransmittable data in flight.
        // TODO: replace retransmittablePacketsOutstanding by bytesInFlight
        if (this.ackElicitingPacketsOutstanding === 0) {
            this.lossDetectionAlarm.reset();
            VerboseLogging.info(this.DEBUGname + " LossDetection:setLossDetectionAlarm : no outstanding retransmittable packets, disabling loss alarm for now");
            return;
        }
        else
            VerboseLogging.debug(this.DEBUGname + " LossDetection:setLossDetectionAlarm : " + this.ackElicitingPacketsOutstanding + " outstanding retransmittable packets" );
        
        var alarmDuration: number;
        var time: number = this.timeOfLastSentAckElicitingPacket;
        if (this.cryptoOutstanding !== 0) {
            // Crypto retransmission alarm.
            if (this.rttMeasurer.smoothedRtt == 0) {
                alarmDuration = QuicLossDetection.kInitialRTT * 2;
            } else {
                alarmDuration = this.rttMeasurer.smoothedRtt * 2;
            }

            alarmDuration = Math.max( alarmDuration + this.rttMeasurer.maxAckDelay, QuicLossDetection.kGranularity);
            var pw = Math.pow(2, this.cryptoCount);
            alarmDuration = alarmDuration * pw;
            time = this.timeOfLastSentCryptoPacket;
            VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: handshake mode " + alarmDuration );
        } else if (this.lossTime != 0) {
            // time threshold loss detection
            alarmDuration = this.lossTime - this.timeOfLastSentAckElicitingPacket;
            VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: early retransmit " + alarmDuration);
        } else {
            // PTO alarm
            
           alarmDuration = this.rttMeasurer.smoothedRtt + this.rttMeasurer.rttVar * 4 + this.rttMeasurer.maxAckDelay;
           alarmDuration = Math.max(alarmDuration, QuicLossDetection.kGranularity);
           alarmDuration = alarmDuration * Math.pow(2, this.ptoCount);
        }

        if (!this.lossDetectionAlarm.isRunning()) {
            this.lossDetectionAlarm.on(AlarmEvent.TIMEOUT, (timePassed:number) => {
                VerboseLogging.info(this.DEBUGname + " LossDetection:setLossDetectionAlarm timeout alarm fired after " + timePassed + "ms");
                this.lossDetectionAlarm.reset();
                this.onLossDetectionAlarm();
            });
            this.lossDetectionAlarm.start(alarmDuration);
        }
    }



    /**
     * QUIC uses one loss recovery alarm, which when set, can be in one of several modes. 
     * When the alarm fires, the mode determines the action to be performed.
     */
    public onLossDetectionAlarm(): void {
        if (this.cryptoOutstanding > 0) {
            // Handshake retransmission alarm.
            this.retransmitAllUnackedHandshakeData();
            this.cryptoCount++;
        } else if (this.lossTime != 0) {
            // Early retransmit or Time Loss Detection
            this.detectLostPackets(this.largestAckedPacket);
        } else {
            //PTO
            //this is also allowed to be one packet
            this.sendTwoPackets()
            this.ptoCount++;
        }
        this.setLossDetectionAlarm();
    }



    private detectLostPackets(largestAcked: Bignum): void {
        this.lossTime = 0;
        var lostPackets: BasePacket[] = [];
        let lossDelay : number = QuicLossDetection.kTimeThreshold * Math.max(this.rttMeasurer.latestRtt, this.rttMeasurer.smoothedRtt);

        //packets send before this time are deemed lost
        let lostSendTime : number = (new Date()).getTime() - lossDelay;

        // packets with packet number before this are lost
        // TODO: check this for pn spaces?
        let lostPN : Bignum = this.largestAckedPacket.subtract(QuicLossDetection.kPacketThreshold);


        Object.keys(this.sendPackets).forEach((key:string) => {
            var unackedPacketNumber = new Bignum(Buffer.from(key, 'hex'));
            if(unackedPacketNumber > largestAcked)
                return;
            
            var unacked = this.sentPackets[key];
            if(unacked.time <= lostSendTime || unacked.packet.getHeader().getPacketNumber().getValue().lessThanOrEqual(lostPN)){
                this.removeFromSentPackets(unackedPacketNumber);
                //TODO: check for
                //if(unacked.inFlight){
                lostPackets.push(unacked.packet);
                //}
            }
            else if(this.lossTime == 0){
                this.lossTime = unacked.time + lossDelay;
            }
            else{
                this.lossTime = Math.min(this.lossTime, unacked.time + lossDelay);
            }
            
        });

        // Inform the congestion controller of lost packets and
        // let it decide whether to retransmit immediately.
        if (lostPackets.length > 0) {
            this.emit(QuicLossDetectionEvents.PACKETS_LOST, lostPackets);
            lostPackets.forEach((packet: BasePacket) => {
                var sentPacket = this.sentPackets[packet.getHeader().getPacketNumber().getValue().toString('hex', 8)];
                if (sentPacket !== undefined && sentPacket.packet.isHandshake()) {
                    this.cryptoOutstanding--;
                }
            });
        }
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
                this.removeFromSentPackets( this.sentPackets[keys[i]].packet.getHeader().getPacketNumber().getValue() );
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
                this.retransmitPacket(this.sentPackets[key]);
                this.removeFromSentPackets( this.sentPackets[key].packet.getHeader().getPacketNumber().getValue() );
            }
        });
    }

    private retransmitPacket(sentPacket: SentPacket) {
        if (sentPacket.packet.isRetransmittable()) {
            this.emit(QuicLossDetectionEvents.RETRANSMIT_PACKET, sentPacket.packet);
        }
    }

    public reset() {
        this.lossDetectionAlarm.reset();
        this.sentPackets = {};
    }
}

export enum QuicLossDetectionEvents {
    RETRANSMISSION_TIMEOUT_VERIFIED = "ld-retransmission-timeout-verified",
    PACKETS_LOST = "ld-packets-lost",
    PACKET_ACKED = "ld-packet-acked",
    RETRANSMIT_PACKET = "ld-retransmit-packet",
    ECN_ACK = "ld-ECN-in-ACK",
    PTO_PROBE_SEND = "ld-PTO-PROBE"
}

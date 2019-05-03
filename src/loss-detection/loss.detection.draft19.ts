import { BasePacket, PacketType } from '../packet/base.packet';
import { Bignum } from '../types/bignum';
import { Alarm, AlarmEvent } from '../types/alarm';
import { AckFrame } from '../frame/ack';
import { EventEmitter } from 'events';
import { Connection, ConnectionEvent } from '../quicker/connection';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { RTTMeasurement } from './rtt.measurement';
import { EncryptionLevel } from '../crypto/crypto.context';
import { logTimeSince } from '../utilities/debug/time.debug';

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
    //Counts towards bytes in flight of congestion control
    // This excludes only ACK only packets while isRetransmittable excludes ACKs and PADDING only packets
    inFlight : boolean
};

/**
 * An enum to enumerate the three packet numberspaces. 
 */
enum kPacketNumberSpace{
    Initial = 0,
    Handshake = 1,
    ApplicationData = 2
}


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
    public static readonly kGranularity : number = 200;
    // The default RTT used before an RTT sample is taken. In ms.
    public static readonly kInitialRTT: number = 100;
    //kpacketnumberspace

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
    // The largest packet number acknowledged in an ACK frame.
    private largestAckedPacket: Bignum[];
    // The time at which the next packet will be considered lost based on early transmit or 
    // exceeding the reordering window in time.
    private lossTime: number[];
    // An association of packet numbers to information about them, including a number field indicating the packet number, 
    // a time field indicating the time a packet was sent, a boolean indicating whether the packet is ack only, 
    // and a bytes field indicating the packet’s size. sent_packets is ordered by packet number, 
    // and packets remain in sent_packets until acknowledged or lost.
    private sentPackets: SentPackets[];

    private ackElicitingPacketsOutstanding: number;
    private cryptoOutstanding: number;

    //TODO: change this from public
    //currently is used by congestion controller to calculate persistent congestion
    public rttMeasurer: RTTMeasurement;

    private connection : Connection;

    public constructor(rttMeasurer: RTTMeasurement, connection: Connection) {
        super();
        this.connection = connection;
        this.lossDetectionAlarm = new Alarm();
        this.cryptoCount = 0;
        this.ptoCount = 0;
        
        this.rttMeasurer = rttMeasurer;
        
        this.timeOfLastSentAckElicitingPacket = 0;
        this.timeOfLastSentCryptoPacket = 0;
        this.largestAckedPacket = [];
        this.lossTime = [];
        this.sentPackets = [];


        for(let space of [kPacketNumberSpace.Initial,kPacketNumberSpace.Handshake, kPacketNumberSpace.ApplicationData]){
            this.largestAckedPacket.push(new Bignum(0));
            this.lossTime.push(0)
            this.sentPackets.push({})
        }

        this.ackElicitingPacketsOutstanding = 0;
        this.cryptoOutstanding = 0;
    }


    private findPacketSpaceFromPacket(packet : BasePacket){
        let type : PacketType = packet.getPacketType();
        if(type == PacketType.Handshake){
            return kPacketNumberSpace.Handshake;
        }
        else if(type == PacketType.Initial){
            return kPacketNumberSpace.Initial;
        }
        else if(type == PacketType.Protected0RTT || type == PacketType.Protected1RTT){
            return kPacketNumberSpace.ApplicationData;
        }
        else{ 
            VerboseLogging.warn(this.DEBUGname + "lossDetection: Trying to find packet space of version negotation or retry packettype or something totally different.")
            return undefined;
        }
    }

    private findPacketSpaceFromAckFrame(frame : AckFrame){
        let type : EncryptionLevel | undefined = frame.getCryptoLevel();
        if(type == EncryptionLevel.HANDSHAKE){
            return kPacketNumberSpace.Handshake;
        }
        else if(type == EncryptionLevel.INITIAL){
            return kPacketNumberSpace.Initial;
        }
        else if(type == EncryptionLevel.ZERO_RTT || type == EncryptionLevel.ONE_RTT){
            return kPacketNumberSpace.ApplicationData;
        }
        else{
            VerboseLogging.error(this.DEBUGname + "lossDetection: Trying to find packet space of " + type);
            return undefined;
        }
    }


 
    /**
     * After any packet is sent, be it a new transmission or a rebundled transmission, the following OnPacketSent function is called
     * @param basePacket The packet that is being sent. From this packet, the packetnumber and the number of bytes sent can be derived.
     */
    public onPacketSent(basePacket: BasePacket): void {
        logTimeSince("loss-det: onpacketsent", "packetnum: " + basePacket.getHeader().getPacketNumber().toString());
        let space : kPacketNumberSpace | undefined = this.findPacketSpaceFromPacket(basePacket);
        if(space === undefined){
            VerboseLogging.error("LossDetection: Did not find packet number space, not adding to sentpackets! packetnumber: " + basePacket.getHeader().getPacketNumber().getValue().toDecimalString());
            return;
        }
        
        var currentTime = (new Date()).getTime();
        var packetNumber = basePacket.getHeader().getPacketNumber().getValue();

        var sentPacket: SentPacket = {
            packet: basePacket,
            time: currentTime,
            isRetransmittable: basePacket.isRetransmittable(),
            inFlight : basePacket.countsTowardsInFlight()
        };

        let packet = this.sentPackets[space][packetNumber.toString('hex', 8)];
        if( packet !== undefined ){
            VerboseLogging.error(this.DEBUGname + " xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
            VerboseLogging.error(this.DEBUGname + " Packet was already in sentPackets buffer! cannot add twice, error!" + packetNumber.toNumber() + " -> packet type=" + packet.packet.getHeader().getPacketType());
            VerboseLogging.error(this.DEBUGname + " xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
        }
        else{
            VerboseLogging.debug(this.DEBUGname + " loss:onPacketSent : adding packet " +  packetNumber.toNumber() + "in space: "+ space +" packet type=" + basePacket.getPacketType() + ", is retransmittable=" + basePacket.isRetransmittable() );

            this.sentPackets[space][packetNumber.toString('hex', 8)] = sentPacket;
        }
        

        if(sentPacket.inFlight){
            if (basePacket.containsCryptoFrames()) {
                VerboseLogging.info("Increasing cryptooutstanding for packetnum " + packetNumber.toDecimalString() + " from space " + space + "   outstanding = " + this.cryptoOutstanding)
                this.cryptoOutstanding++;
                this.timeOfLastSentCryptoPacket = currentTime;
            }
            if (basePacket.isRetransmittable()) {
                this.ackElicitingPacketsOutstanding++;
                this.timeOfLastSentAckElicitingPacket = currentTime;
            }
            this.emit(QuicLossDetectionEvents.PACKET_SENT, basePacket)
            this.setLossDetectionAlarm();


        }
    }



    private updateRtt(ackFrame: AckFrame) {
        let space : kPacketNumberSpace | undefined = this.findPacketSpaceFromAckFrame(ackFrame);
        if( space === undefined ){
            return;
        }
        let largestAcknowledgedPacket : SentPacket = this.sentPackets[space][ackFrame.getLargestAcknowledged().toString('hex', 8)];

         // check if we have not yet received an ACK for the largest acknowledge packet (then it would have been removed from this.sentPackets)
         // we could receive a duplicate ACK here, for which we don't want to update our RTT estimates
         if( largestAcknowledgedPacket !== undefined && largestAcknowledgedPacket.isRetransmittable){
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
        let space : kPacketNumberSpace | undefined= this.findPacketSpaceFromAckFrame(ackFrame);
        if(space === undefined){
            return;
        }
        // VerboseLogging.info(this.DEBUGname + " Loss:onAckReceived AckFrame from space " + space + " is acking " + ackFrame.determineAckedPacketNumbers().map((val, idx, arr) => val.toNumber()).join(","));
        this.largestAckedPacket[space] = Bignum.max( ackFrame.getLargestAcknowledged(), this.largestAckedPacket[space]);
        
        this.updateRtt(ackFrame);
        
        // Process ECN information if present.	
        //TODO: fill this in when detecting ecn in acks is possible.
        /* if (ACK frame contains ECN information){	
            this.emit(LossDetectionEvents.ECN_ACK, ackFrame)
        }*/
        
        this.determineNewlyAckedPackets(ackFrame).forEach((sentPacket: BasePacket) => {
            this.onSentPacketAcked(sentPacket);
        });
        this.detectLostPackets(space);


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
        VerboseLogging.info("Loss: Received ackframe for:" + ackedPacketnumbers.toString());

        ackedPacketnumbers.forEach((packetnumber: Bignum) => {
            //VerboseLogging.info("Loss:determineNewlyAckedPackets : looking for sent packet " + packetnumber.toNumber());
            let space : kPacketNumberSpace | undefined = this.findPacketSpaceFromAckFrame(receivedAckFrame);
            if(space == undefined){
                VerboseLogging.error("error, undefined numberspace");
                return;
            }
            let foundPacket = this.sentPackets[space][packetnumber.toString('hex', 8)];
            if (foundPacket !== undefined) {
                //VerboseLogging.info("Loss:determineNewlyAckedPackets : Was found " + packetnumber.toNumber());
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
        logTimeSince("lossdetection: onSentPacketAcked", "packetnum: " + sentPacket.getHeader().getPacketNumber().toString());
        let ackedPacketNumber: Bignum = sentPacket.getHeader().getPacketNumber().getValue();
        VerboseLogging.info(this.DEBUGname + " loss:onSentPacketAcked called for nr " + ackedPacketNumber.toNumber() + " with packettype " + sentPacket.getPacketType() + ", is retransmittable=" + sentPacket.isRetransmittable());


        let packet : SentPacket | undefined= this.removeFromSentPackets( this.findPacketSpaceFromPacket(sentPacket), ackedPacketNumber );


        //TODO: loss detection should probably not be the one to notify connection for new acks?
        this.connection.lossDetectionNewPacketAcked(sentPacket);
        if(packet !== undefined && packet.inFlight)
            this.emit(QuicLossDetectionEvents.PACKET_ACKED, packet);
        
        
    }



    private removeFromSentPackets( space:kPacketNumberSpace | undefined, packetNumber:Bignum ){

        if(space === undefined){
            VerboseLogging.warn(this.DEBUGname + " LossDetection: Trying to remove packet from undefined packet space ");
            return;
        }
        let packet = this.sentPackets[space][packetNumber.toString('hex', 8)];
        if( !packet ){
            VerboseLogging.error("LossDetection:removeFromSentPackets : packet not in sentPackets " + packetNumber.toString('hex', 8) + ". SHOULD NOT HAPPEN! added this because it crashes our server, no idea yet what causes it");
            return;
        }

        if (this.sentPackets[space][packetNumber.toString('hex', 8)].packet.isRetransmittable()) {
            this.ackElicitingPacketsOutstanding--;
        }
        if (this.sentPackets[space][packetNumber.toString('hex', 8)].packet.containsCryptoFrames()) {
            VerboseLogging.info("Decreasing cryptooutstanding for packetnum " + packetNumber.toDecimalString() + " from space " + space + "   outstanding = " + this.cryptoOutstanding)
            this.cryptoOutstanding--;
        }
        let sentPacket =  this.sentPackets[space][packetNumber.toString('hex', 8)];
        VerboseLogging.info("LossDetection: Removing packet " + packetNumber.toDecimalString() + "from sentPackets, in space: " + space + " and type " + sentPacket.packet.getPacketType())
        delete this.sentPackets[space][packetNumber.toString('hex', 8)];
        return sentPacket;
    }


    /**
     * Returns the earliest loss_time and the packet number space its from
     */
    private getEarliestLossTime(){
        let time : number = this.lossTime[kPacketNumberSpace.Initial];
        let space :kPacketNumberSpace = kPacketNumberSpace.Initial;

        
        for(let pnSpace of [kPacketNumberSpace.Handshake, kPacketNumberSpace.ApplicationData]){
            if(this.lossTime[pnSpace] !== 0 && (time === 0 || this.lossTime[pnSpace] < time)){
                time = this.lossTime[pnSpace];
                space = pnSpace;
            }
        }
        return [time, space];
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
        let earliestLoss = this.getEarliestLossTime()[0];
        let alarmType : string = "";

        if (earliestLoss != 0) {
            // time threshold loss detection
            // context: If packets sent prior to the largest acknowledged packet cannot yet be declared lost, then a timer SHOULD be set for the remaining time.
            // TODO: check if this calculation does what it's supposed to
            alarmDuration = earliestLoss - this.timeOfLastSentAckElicitingPacket;
            VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: early retransmit " + alarmDuration);
            alarmType = "TimeThreshold";
        } else if (this.cryptoOutstanding !== 0) {
            // Crypto retransmission alarm.
            if (this.rttMeasurer.smoothedRtt == 0) {
                alarmDuration = QuicLossDetection.kInitialRTT * 2;
            } else {
                alarmDuration = this.rttMeasurer.smoothedRtt * 2;
            }

            alarmDuration = Math.max( alarmDuration, QuicLossDetection.kGranularity);
            var pw = Math.pow(2, this.cryptoCount);
            alarmDuration = alarmDuration * pw;
            time = this.timeOfLastSentCryptoPacket;
            VerboseLogging.debug(this.DEBUGname + " LossDetection:alarm: handshake mode " + alarmDuration + " | cryptoOutstanding = " + this.cryptoOutstanding );
            alarmType = "CryptoRetransmission";
        } else {
            // PTO alarm
           alarmDuration = this.rttMeasurer.smoothedRtt + Math.max(QuicLossDetection.kGranularity ,this.rttMeasurer.rttVar * 4) + this.rttMeasurer.maxAckDelay;
           alarmDuration = alarmDuration * Math.pow(2, this.ptoCount);
           alarmType = "PTOTimeout";
        }

        this.lossDetectionAlarm.reset();
        this.lossDetectionAlarm.on(AlarmEvent.TIMEOUT, (timePassed:number) => {
            VerboseLogging.info(this.DEBUGname + " LossDetection:setLossDetectionAlarm timeout alarm fired after " + timePassed + "ms");
            this.lossDetectionAlarm.reset();
            this.onLossDetectionAlarm();
        });
        this.lossDetectionAlarm.start(alarmDuration);
        //TODO: get last handshake date?
        this.connection.getQlogger().onLossDetectionArmed(alarmType, new Date(0), alarmDuration);
        
    }



    /**
     * QUIC uses one loss recovery alarm, which when set, can be in one of several modes. 
     * When the alarm fires, the mode determines the action to be performed.
     */
    public onLossDetectionAlarm(): void {
        let earliestLossTime = this.getEarliestLossTime()[0];
        let space = this.getEarliestLossTime()[1];
        let alarmtype = "";

        if (earliestLossTime != 0) {
            // Time threshold detection
            this.detectLostPackets(space);
            alarmtype = "TimeThreshold";
        }
        else if (this.cryptoOutstanding > 0) {
            // Crypto retransmission alarm.
            this.retransmitAllUnackedHandshakeData();
            this.cryptoCount++;
            alarmtype = "CryptoRetransmission";
        } else {
            //PTO
            //this is also allowed to be one packet
            this.sendTwoPackets()
            this.ptoCount++;
            alarmtype = "PTOTimeout";
        }
        this.connection.getQlogger().onLossDetectionTriggered(alarmtype, {});
        this.setLossDetectionAlarm();
    }



    private detectLostPackets(space: kPacketNumberSpace): void {
        this.lossTime[space] = 0;
        var lostPackets: SentPacket[] = [];
        let lossDelay : number = QuicLossDetection.kTimeThreshold * Math.max(this.rttMeasurer.latestRtt, this.rttMeasurer.smoothedRtt);

        //packets send before this time are deemed lost
        let lostSendTime : number = (new Date()).getTime() - lossDelay;

        // packets with packet number before this are lost
        let lostPN : Bignum = this.largestAckedPacket[space].subtract(QuicLossDetection.kPacketThreshold);


        Object.keys(this.sentPackets[space]).forEach((key:string) => {
            var unackedPacketNumber = new Bignum(Buffer.from(key, 'hex'));
            if(unackedPacketNumber > this.largestAckedPacket[space])
                return;
            
            var unacked = this.sentPackets[space][key];
            if(unacked.time <= lostSendTime || unacked.packet.getHeader().getPacketNumber().getValue().lessThanOrEqual(lostPN)){
                this.removeFromSentPackets(space, unackedPacketNumber);
                if(unacked.inFlight){
                    VerboseLogging.info("LossDetecion: packet " + unacked.packet.getHeader().getPacketNumber().getValue() + " was deemded lost");
                    lostPackets.push(unacked);
                    this.connection.getQlogger().onPacketLost(unacked.packet.getHeader().getPacketNumber().getValue());
                }
            }
            else{ 
                // set the lossTime for the time threshold loss detection
                if(this.lossTime[space] == 0){
                    this.lossTime[space] = unacked.time + lossDelay;
                }
                else{
                    this.lossTime[space] = Math.min(this.lossTime[space], unacked.time + lossDelay);
                }
            }
            
        });

        // Inform the congestion controller of lost packets and
        // let it decide whether to retransmit immediately.
        if (lostPackets.length > 0) {
            this.emit(QuicLossDetectionEvents.PACKETS_LOST, lostPackets);
            lostPackets.forEach((lostPacket: SentPacket) => {
                var sentPacket = this.sentPackets[space][lostPacket.packet.getHeader().getPacketNumber().getValue().toString('hex', 8)];
                //originally, the crypto packets outstanding got substracted here, but since these should only be detected lost by cryptoretransmission, they should be subtracted at acknowledgment of the retransmit
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
        /**
         * TODO: what if there are no packets left to send?
         * rfc also specifies to first send new data, before sending unacked data
         * (but also allows some other strategy)
         * since PTO uses this function (via sendTwoPackets())
         * a probe might not happen
         * this situation might present itself when there is 1 packet unacked
         * PTO happens (and in current implementation sendTwoPackets() is called)
         * one probe gets sent with the unacked data but a second one can not be found
         * (test to make sure this is true)
         */
        var sendCount = 0;
        for(let space of [kPacketNumberSpace.Initial,kPacketNumberSpace.Handshake, kPacketNumberSpace.ApplicationData]){
            var i = 0;
            var keys = Object.keys(this.sentPackets[space]);
            while (keys.length > i) {
                if (this.sentPackets[space][keys[i]].packet.isRetransmittable()) {
                    
                    this.retransmitPacket(this.sentPackets[space][keys[i]]);
                    this.removeFromSentPackets(space, this.sentPackets[space][keys[i]].packet.getHeader().getPacketNumber().getValue() );
                    //delete this.sentPackets[keys[i]];
                    
                    sendCount++;
                    if (sendCount === amount) {
                        return;
                    }
                }
                i++;
            }
        }
    }

    private retransmitAllUnackedHandshakeData(): void {
        for(let space of [kPacketNumberSpace.Initial,kPacketNumberSpace.Handshake, kPacketNumberSpace.ApplicationData]){
            Object.keys(this.sentPackets[space]).forEach((key: string) => {
                if (this.sentPackets[space][key].packet.isHandshake()) {
                    this.retransmitPacket(this.sentPackets[space][key]);
                    this.removeFromSentPackets(space, this.sentPackets[space][key].packet.getHeader().getPacketNumber().getValue() );
                }
            });
        }
    }

    private retransmitPacket(sentPacket: SentPacket) {
        if (sentPacket.packet.isRetransmittable()) {
            this.emit(QuicLossDetectionEvents.RETRANSMIT_PACKET, sentPacket.packet);
        }
    }

    public reset() {
        VerboseLogging.warn("LossDetection: Resetting!!")
        this.lossDetectionAlarm.reset();
        this.sentPackets = [];
        for(let space of [kPacketNumberSpace.Initial,kPacketNumberSpace.Handshake, kPacketNumberSpace.ApplicationData]){
            this.sentPackets.push({});
        }
    }
}

export enum QuicLossDetectionEvents {
    RETRANSMISSION_TIMEOUT_VERIFIED = "ld-retransmission-timeout-verified",
    PACKETS_LOST = "ld-packets-lost",
    PACKET_ACKED = "ld-packet-acked",
    RETRANSMIT_PACKET = "ld-retransmit-packet",
    ECN_ACK = "ld-ECN-in-ACK",
    PACKET_SENT = "ld-packet-sent"
}

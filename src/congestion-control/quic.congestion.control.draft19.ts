import { Bignum } from "../types/bignum";
import { BasePacket } from "../packet/base.packet";
import { Connection, ConnectionEvent } from "../quicker/connection";
import { QuicLossDetection, QuicLossDetectionEvents, SentPacket } from "../loss-detection/loss.detection.draft19";
import { PacketType } from '../packet/base.packet';
import { VerboseLogging } from "../utilities/logging/verbose.logging"
import { CryptoContext, EncryptionLevel, PacketNumberSpace } from '../crypto/crypto.context';
import { AckFrame } from "../frame/ack";
import { RTTMeasurement } from "../loss-detection/rtt.measurement";
import { PacketPipe } from "../packet-pipeline/packet.pipe.interface";
import { logTimeSince } from "../utilities/debug/time.debug";


/**
 * This implementation tries to follow the quic draft (draft-19) as strictly as possible. 
 * Both in terms of variable names and implementation. This is done so for a one-to-one match
 * of code and rfc.
 * Variable name changes will try to be made only for clarity or code style.
 */

export class QuicCongestionControl extends PacketPipe { 
    
    /////////////////////////////////
    // CONSTANTS
    ////////////////////////////////
    /**
     * Maximum payload size of the sender. (excluding IP or UDP overhead)
     * Used for initial and minimum CWin. Specified in number of bytes
     */
    /* THOUGHT: Why was this 1460 in the original (draft-15) implementation? */
    private static kMaxDatagramSize : number = 1200;
    /**
     * Starting size of the congestion window. Limits the inital amount of data in flight.
     */
    private static kInitialWindow : number = Math.min(10*QuicCongestionControl.kMaxDatagramSize, 
                                                        Math.max(2*QuicCongestionControl.kMaxDatagramSize, 14720));
    /**
     * The lowest value the window may hit
     */
    private static kMinimumWindow : number = 2 * QuicCongestionControl.kMaxDatagramSize;
    /**
     * Factor by which the congestion window will change
     * Due to the way Bignum seems to work, this will be the number the window is divided by, not multiplied
     */
    private static kLossReductionFactor : number = 2;
    /**
     * Number of consecutive PTOs for persistent congestion to be established
     */
    /* THOUGHT: check out what PTOs exactly do, (similar to tail loss probe and rto in tcp?) */
    private static kPersistenCongestionThreshold : number = 2;


    /////////////////////////////////
    // CONGESTION VARIABLES
    ////////////////////////////////
    /**
     * used to detect changes in the ECN-CE counter
     * Contains highest value reported by the peer. 
     */
    private ecnCeCounter : Bignum;
    /**
     * The total number of bytes in flight.
     */
    private bytesInFlight : Bignum;
    /**
     * The maximum number of bytes in flight (See bytesInFlight variable)
     */
    private congestionWindow : Bignum;
    /**
     * The time when a loss is detected. (and thus entered recovery)
     */
    private recoveryStartTime : number;
    /**
     * Slow Start threashold
     */
    private ssthresh : Bignum;

    /////////////////////////////////
    // IMPLEMENTATION VARIABLES
    ////////////////////////////////
    /**
     * The connection of this congestion instance
     */
    private connection: Connection;
    /**
     * Queue of packets to be sent
     */
    /* THOUGHT: Maybe put this in a helper class? could be reused for maybe pacer */
    private packetsQueue: BasePacket[];
    /**
     * Data class that calculates and saves the current rtt measurements
     * used for calculating persistent congestion
     */
    private RTTMeasurer : RTTMeasurement;

    

    public constructor(connection: Connection, lossDetectionInstances: Array<QuicLossDetection>, rttMeasurer: RTTMeasurement) {
        super();
        //quic congestion control init
        this.ecnCeCounter = new Bignum(0);
        this.congestionWindow = new Bignum(QuicCongestionControl.kInitialWindow);
        this.bytesInFlight = new Bignum(0);
        this.recoveryStartTime = 0;
        this.ssthresh = Bignum.infinity();

        //implementation specific init
        this.packetsQueue = [];
        this.connection = connection;
        this.hookCongestionControlEvents(lossDetectionInstances);
        this.RTTMeasurer = rttMeasurer;
    }

    
    private hookCongestionControlEvents(lossDetectionInstances: Array<QuicLossDetection>) {
        for( let lossDetection of lossDetectionInstances){
            lossDetection.on(QuicLossDetectionEvents.PACKET_ACKED, (ackedPacket: SentPacket) => {
                this.onPacketAckedCC(ackedPacket);
            });
            lossDetection.on(QuicLossDetectionEvents.PACKETS_LOST, (lostPackets: SentPacket[]) => {
                this.onPacketsLost(lostPackets);
            });
            lossDetection.on(QuicLossDetectionEvents.ECN_ACK, (frame : AckFrame) => {
                this.ProcessECN(frame);
            });
            lossDetection.on(QuicLossDetectionEvents.PACKET_SENT, (packet : BasePacket) => {
                this.onPacketSentCC(packet);
            });
        }
    }
    
    /**
     * Checks if the system is in the recovery state.
     * @param time send time of packet to check if it's in recovery
     */
    public inRecovery(time: number): boolean {
        return time <= this.recoveryStartTime;
    }

    /**
     * Checks if the system is in slow start state
     */
    public inSlowStart() : boolean{
        return this.congestionWindow.lessThan(this.ssthresh);
    }
        

    /**
     * When a packet is sent
     * @param bytes_sent number of bytes sent
     */
    private onPacketSentCC(sentPacket : BasePacket){
        //if the packets contains non-ack frames
        if( !sentPacket.isAckOnly()){
            var bytesSent = sentPacket.getSerializedSizeInBytes();
            this.setBytesInFlight(this.bytesInFlight.add(bytesSent), "PACKET_SENT", {"packet_num" : sentPacket.getHeader().getPacketNumber().getValue().toDecimalString(), "added" : bytesSent, "packettype": sentPacket.getPacketType()});
        }
    }


    /**
     * When an ack for a packet has been received
     * @param ackedPacket the packet that has been ACKed
     */
    private onPacketAckedCC(ackedPacket : SentPacket) {
        let packet = ackedPacket.packet;
        var bytesAcked = packet.getSerializedSizeInBytes();
        this.setBytesInFlight(this.bytesInFlight.subtract(bytesAcked), "ACK_RECEIVED", {"packet_num" : ackedPacket.packet.getHeader().getPacketNumber().getValue().toDecimalString(), "subtracted" : bytesAcked, "packettype": ackedPacket.packet.getPacketType()});

        if(this.inRecovery(ackedPacket.time)){
            // No change in congestion window in recovery period
        }
        /** TODO how to detect if app limited
         * else if(isAppLimited()){
         * return;
         * }
         */
        else if(this.inSlowStart()){
            // increase congestion window by ackedPacket bytes
            this.setCWND(this.congestionWindow.add(bytesAcked));
        }
        else{
            // in congestion avoidance
            //THOUGHT: change from maxsize -> bytesacked in quic algorithm why?
            let bytesIncrease : Bignum = new Bignum(QuicCongestionControl.kMaxDatagramSize * bytesAcked).divide(this.congestionWindow)
            this.setCWND(this.congestionWindow.add(bytesIncrease));
        }
        //THOUGHT: this is here because the bytesinflight only decreases after an ack
        this.sendPackets();
    }

    /**
     * A congestion happened
     * @param sentTime packet number (and implicit the time) of the packet that caused the event
     */
    private congestionEventHappened(sentTime : number){
        // Start new congestion event if the sent time is larger
        // than the start time of the previous recovery epoch.
        if(!this.inRecovery(sentTime)){
           
            this.recoveryStartTime = Date.now();
            let newval = this.congestionWindow.divide(QuicCongestionControl.kLossReductionFactor);
            VerboseLogging.info("newval has become:" + newval.toDecimalString());
            this.setCWND(Bignum.max(newval, QuicCongestionControl.kMinimumWindow));
            this.ssthresh = this.congestionWindow;
        }
    }

    /**
     * Process a received ECN frame
     * @param ack AckFrame the ack frame that contained the congestion notification
     */
    private ProcessECN(ack : AckFrame){
        /* TODO: this is commented out so that congestionEvent can actually use the time instead of the PN
                Since ECN is not enabled as is, until then this won't be used anyway and hopefully time is extractable by then
        if(ack.getCEcount().greaterThan(this.ecnCeCounter)){
          this.ecnCeCounter = ack.getCEcount();
          this.congestionEventHappened(ack.getLargestAcknowledged())
        }*/
    }


    // Determine if all packets in the window before the
    // newest lost packet, including the edges, are marked
    // lost
    // this is the most unclear name for this function they could have chosen
    // window does not reference the congestion window, but just the congestion period window created by largestlosttime - congestion period
    private isWindowLost(largestLostTime : number, smallestLostTime : number, congestionPeriod : number){
/**
     *      if smallest is smaller than or equal to [largest - congestion_period] then it's in persistent congestion (??)
     *      
     *      what the quinn implementation does is: 
     *                                              if the left edge of the window is before the perioud of [largest_lost - period, largest_lost]
     *                                              then it's in persistent congestion
     *      what this implementation could do is:
     *                                              if the smallest is before *or on* the left edge of [largest_lost - period, largest_lost]
     *                                              then it's in persistent congestion. since the window slides along with the already acked, the smallest lost could also be a 
     *                                              decent measure of where the left edge of the window is.
     *                                              this would also work in following situation [unacked acked unacked unacked ...unacked acked ...]
     *                                                                                           ^smallestlost                      ^largestlost
     *      This might pose issue if [unacked unacked ..... acked unacked unacked acked unacked] where there is a single acked packet in the middle of a huge series drop
     *      does this count as persistent congestion? 
     *  
     *      also issue when two random packets were dropped far enough away from each other
     //TODO: change onPacketsLost to pass the two furthest away packets with a full block of lost data inbetween, somehow
     */

        // quinn : rust implementation version
        // InPersistentCongestion: Determine if all packets in the window before the newest
        // lost packet, including the edges, are marked lost
        // in_persistent_congestion |= space.largest_acked_packet_sent
        //                              < largest_lost_time.unwrap() - persistent_congestion_period;

        return smallestLostTime <= largestLostTime - congestionPeriod;
    }

    /**
     * 
     * @param largestLostTime time since epoch for the largest lost packet
     * @param smallestLostTime time since epoch for the smallest lost packet
     */
    private inPersistentCongestion(largestLostTime : number, smallestLostTime : number) : Boolean{
        let pto = this.RTTMeasurer.smoothedRtt + Math.max(4* this.RTTMeasurer.rttVar, QuicLossDetection.kGranularity) + this.RTTMeasurer.maxAckDelay;

        let congestionPeriod = pto * (Math.pow(2, QuicCongestionControl.kPersistenCongestionThreshold -1))

        //older pseudocode: https://github.com/quicwg/base-drafts/pull/2365/files/be6ce7203971eb1e5e26df20b051aa795aa83236
        //InPersistentCongestion( newest_lost_packet.time_sent - oldest_lost_packet.time_sent)
        //
        // InPersistentCongestion(congestion_period):
            //pto = smoothed_rtt + 4 * rttvar + max_ack_delay
            //return congestion_period > pto * (2 ^ kPersistentCongestionThreshold - 1)
        return this.isWindowLost(largestLostTime, smallestLostTime,congestionPeriod);
    }


    /**
     * called when lossdetection detects lost packets
     * @param lostPackets the packets that have been lost
     */     
    private onPacketsLost(lostPackets: SentPacket[]) {
        let largestLostPNum : Bignum = new Bignum(0);
        //time since epoch
        let largestLostTime : number = 0;
        let largestLostPacket! : BasePacket;

        let smallestLostPNum : Bignum = Bignum.infinity();
        //time since epoch
        let smallestLostTime : number = Number.POSITIVE_INFINITY;
        let smallestLostPacket! : BasePacket;

        let totalLostBytes = new Bignum(0);

        lostPackets.forEach((lostPacket: SentPacket) => {
            if (lostPacket.packet.isAckOnly())
                return;

            var packetByteSize = lostPacket.packet.getSerializedSizeInBytes();
            totalLostBytes = totalLostBytes.add(packetByteSize);

            //find last/largest lost packet
            if (lostPacket.time > largestLostTime) {
                largestLostPNum = lostPacket.packet.getHeader().getPacketNumber().getValue();
                largestLostTime = lostPacket.time;
                largestLostPacket = lostPacket.packet;
            }
            //find first/smalles lost packet
            if(lostPacket.time < smallestLostTime){
                smallestLostPNum = lostPacket.packet.getHeader().getPacketNumber().getValue();
                smallestLostTime = lostPacket.time;
                smallestLostPacket = lostPacket.packet;
            }
        });

        // Remove lost packets from bytesInFlight.
        this.setBytesInFlight(this.bytesInFlight.subtract(totalLostBytes), "PACKET_LOST", {"smallestPacketNum" : smallestLostPNum, "largestPacketNum" : largestLostPNum, "subtracted" : totalLostBytes.toDecimalString()});
        this.congestionEventHappened(largestLostTime);
        this.sendPackets();

        if(this.inPersistentCongestion(largestLostTime, smallestLostTime)){
            //reset cwnd to minimum
            this.setCWND(new Bignum(QuicCongestionControl.kMinimumWindow));
        }
    }


    /**
     * implementation of the abstract PacketPipe function
     * @param packet packet to enter the congestion control
     */
    public packetIn(packet: BasePacket) {
        logTimeSince("congestioncontrol: packetin:", "packetnumber is " + packet.getHeader().getPacketNumber().getValue().toDecimalString());
        this.packetsQueue.push(packet);
        this.sendPackets();
    }


    /**
     * get the packet number space of the passed packet's type
     * @param packet packet to get the space of
     */
    private getPNSpace(packet : BasePacket){
        if(packet === undefined) { return undefined }
        let ctx:CryptoContext|undefined = this.connection.getEncryptionContextByPacketType( packet.getPacketType());
        if( ctx ){ // VNEG and retry packets have no packet numbers
            let pnSpace:PacketNumberSpace = ctx.getPacketNumberSpace();
            return pnSpace;
        }
        return undefined;
    }


    private checkIdleConnection(){
        //TODO: check if this causes no unintentional resets of the congestion window
        // or if this test even passes at all due to the current placed this.sendPackets() setup
        
        //this does cause a reset at the very end of a transmission, commented

        //if(this.packetsQueue.length == 0 && this.bytesInFlight.equals(0)){
        //    this.setCWND(new Bignum(QuicCongestionControl.kInitialWindow));
        //}
    }



    //TODO REFACTOR:
    // having this.sendpackets() in random places doesn't really make sense to me?

    private alreadySetPn : boolean = false;
    private sendPackets(){
        // TODO: doublecheck if some packets need to be excluded from blocking by CC/pacer
        // update, PTO packets need to not be blocked
        this.checkIdleConnection();
        while (this.bytesInFlight.lessThan(this.congestionWindow) && this.packetsQueue.length > 0) {
            var packet: BasePacket | undefined = this.packetsQueue.shift();

            
            
            if (packet !== undefined) {
                if(!this.alreadySetPn){
                    this.initPacketNumber(packet);
                    this.alreadySetPn = true;
                }
                if(this.bytesInFlight.add(packet.toBuffer(this.connection).byteLength).lessThan(this.congestionWindow)){
                    this.sendSingularPacket(packet);
                    this.alreadySetPn = false;
                }
                else{
                    this.packetsQueue.unshift(packet);
                    break;
                }
                
            }
        }
    }

    /**
     * Init's the packet with the correct PNSpace packet number
     * 
     * Currently also does some debug logging
     * @param packet
     */
    private initPacketNumber(packet : BasePacket){
        let pnSpace:PacketNumberSpace | undefined = this.getPNSpace(packet);

        if(pnSpace !== undefined){ 
            packet.getHeader().setPacketNumber( pnSpace.getNext() ); 

            let DEBUGhighestReceivedNumber = pnSpace.getHighestReceivedNumber();
            let DEBUGrxNumber = -1;
            if( DEBUGhighestReceivedNumber !== undefined )
                DEBUGrxNumber = DEBUGhighestReceivedNumber.getValue().toNumber();

            VerboseLogging.info("CongestionControl:sendPackets : PN space \"" + PacketType[ packet.getPacketType() ] + "\" TX is now at " + pnSpace.DEBUGgetCurrent() + " (RX = " + DEBUGrxNumber + ")" );
        }
    }

    
    /**
     * Send out a singular packet, emit PACKET_SENT
     * @param packet the packet to send
     */
    private sendSingularPacket(packet : BasePacket){
        let pktNumber = packet.getHeader().getPacketNumber();


        VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") + " from type " + packet.getPacketType() );
        this.nextPipeFunc(packet);
       
        this.connection.packetHasBeenSent(packet);
                 
    }



    private setCWND(newVal : Bignum){
        let oldVal = this.congestionWindow;
        this.congestionWindow = newVal;




        let congestionState = "Avoidance";
        //Todo: change this, date.now() will never give in recovery...
        if(this.inRecovery(Date.now())){
            congestionState = "Recovery";
        }
        if(this.inSlowStart()){
            congestionState = "Slow Start"
        }
        this.connection.getQlogger().onCWNDUpdate(congestionState, this.congestionWindow.toDecimalString(), oldVal.toDecimalString())
    }


    private setBytesInFlight(newVal : Bignum, trigger : ("PACKET_SENT" | "PACKET_RECEIVED" | "ACK_SENT" | "ACK_RECEIVED" | "PACKET_LOST"), additionalData : Object = {}){
        this.bytesInFlight = newVal;
        this.connection.getQlogger().onBytesInFlightUpdate(this.bytesInFlight, this.congestionWindow, trigger, additionalData);
    }
}

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


/**
 * This implementation tries to follow the quic draft (draft-18) as strictly as possible. 
 * Both in terms of variable names and implementation. This is done so for a one-to-one match
 * of code and rfc.
 * Variable name changes will try to be made only for clarity or code style.
 */

export class CubicCongestionControl extends PacketPipe {
    
    /////////////////////////////////
    // CONSTANTS
    ////////////////////////////////
    /**
     * Maximum payload size of the sender. (excluding IP or UDP overhead)
     */
    private static kMaxDatagramSize : number = 1200;
    /**
     * Starting size of the congestion window. Limits the inital amount of packets in flight.
     */
    private static kInitialWindow : number = 10;
    /**
     * The lowest value the window may hit
     */
    private static kMinimumWindow : number = 2;
    /**
     * Factor by which the congestion window will change
     */
    private static kLossReductionFactor : number = 0.2;
    /**
     * is tcp friendliness activated
     */
    private static tcpFriendliness : boolean = true;
    /**
     * is fast convergence activated
     */
    private static fastConvergence : boolean = true;
    /**
     * The cubic parameter
     */
    private static CUBICParameter : number = 0.4;

    /////////////////////////////////
    // CONGESTION VARIABLES
    ////////////////////////////////
    /**
     * The total number of bytes in flight.
     */
    private bytesInFlight : Bignum;
    /**
     * The maximum number of maximum sized packets in flight 
     */
    private congestionWindow : number;
    /**
     * The time when a loss is detected. (and thus entered recovery)
     */
    private recoveryStartTime : number;
    /**
     * Slow Start threshold
     */
    private ssthresh : number;
    /**
     * the previous maximum
     */
    private WlastMax !: number;
    /**
     * the time (since computer-time epoch) at which the current congestion avoidance epoch started
     */
    private epochStart !: number;
    /**
    * the point where the cubic graph will be flat (wlastmax in normal situations(?))
     */
    private originPoint !: number;
    /**
     * minimum delay
     * minimum RTT is already calculated in the rtt measurement, so will probably be using that
     */
    private dMin !: number;
    /**
     * the windows tcp would have
     */
    private Wtcp !: number;
    /**
     * K is the time period that the
        growth function takes to increase W to Wmax when there is
        no further loss event 
     */
    private K !: number;
    /**
     * ack count
     */
    private ackCnt !: number;
    /**
     * count of when to increase the cwnd
     */
    private cwndCnt : number = 0;


    

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
        this.congestionWindow = CubicCongestionControl.kInitialWindow;
        this.bytesInFlight = new Bignum(0);
        this.recoveryStartTime = 0;
        this.ssthresh = Number.MAX_VALUE;

        //implementation specific init
        this.packetsQueue = [];
        this.connection = connection;
        this.hookCongestionControlEvents(lossDetectionInstances);
        this.RTTMeasurer = rttMeasurer;
        this.cubic_reset();
    }

    private cubic_reset(){
        this.WlastMax = 0;
        this.epochStart = 0;
        this.originPoint = 0;
        this.dMin = 0;
        this.Wtcp = 0;
        this.K = 0;
        this.ackCnt = 0
    }

    
    private hookCongestionControlEvents(lossDetectionInstances: Array<QuicLossDetection>) {
        for( let lossDetection of lossDetectionInstances){
            lossDetection.on(QuicLossDetectionEvents.PACKET_ACKED, (ackedPacket: SentPacket) => {
                this.onPacketAckedCC(ackedPacket);
            });
            lossDetection.on(QuicLossDetectionEvents.PACKETS_LOST, (lostPackets: SentPacket[]) => {
                this.onPacketsLost(lostPackets);
            });
            lossDetection.on(QuicLossDetectionEvents.PACKET_SENT, (packet : BasePacket) => {
                this.onPacketSentCC(packet);
            });
            lossDetection.on(QuicLossDetectionEvents.RETRANSMIT_PACKET, (packet: BasePacket) => {
                this.setBytesInFlight(this.bytesInFlight.subtract(packet.getSerializedSizeInBytes()), "PACKET_RETRANSMITTED");
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
        return this.congestionWindow < this.ssthresh;
    }
        

    /**
     * When a packet is sent
     * @param bytes_sent number of bytes sent
     */
    private onPacketSentCC(sentPacket : BasePacket){
        //if the packets contains non-ack frames
        if( !sentPacket.isAckOnly()){
            var bytesSent = sentPacket.toBuffer(this.connection).byteLength;
            this.setBytesInFlight(this.bytesInFlight.add(bytesSent), "PACKET_SENT", {"packet_num" : sentPacket.getHeader().getPacketNumber().getValue().toDecimalString(), "added" : bytesSent, "packettype": sentPacket.getPacketType()});
        }
    }


    /**
     * When an ack for a packet has been received
     * @param ackedPacket the packet that has been ACKed
     */
    private onPacketAckedCC(ackedPacket : SentPacket) {
        let packet = ackedPacket.packet;
        var bytesAcked = packet.toBuffer(this.connection).byteLength;
        this.setBytesInFlight(this.bytesInFlight.subtract(bytesAcked), "ACK_RECEIVED", {"packet_num" : ackedPacket.packet.getHeader().getPacketNumber().getValue().toDecimalString(), "subtracted" : bytesAcked, "packettype": ackedPacket.packet.getPacketType()});

        // IN SLOW START
        if(this.congestionWindow <= this.ssthresh){
            this.setCWND(this.congestionWindow + 1);
        }
        //else
        else{
            let cnt = this.cubicUpdate();
            if(this.cwndCnt > cnt){
                this.setCWND(this.congestionWindow + 1);
                this.cwndCnt = 0;
            }
            else{
                this.cwndCnt = this.cwndCnt +1;
            }
        }

        //THOUGHT: this is here because the bytesinflight only decreases after an ack
        this.sendPackets();
    }


    private cubicUpdate(): number {
        this.ackCnt = this.ackCnt + 1;
        //start new epoch (time since last loss)
        if(this.epochStart <= 0){
            this.epochStart = Date.now();
            if(this.congestionWindow < this.WlastMax){
                //calculate time until we hit lastmax
                this.K = Math.cbrt((this.WlastMax - this.congestionWindow) / CubicCongestionControl.CUBICParameter);
                this.originPoint = this.WlastMax;
            }
            else{
                //set originpoint to the current congestion window
                // since the cwnd is above the lastmax at the start of an epoch, start probing from the current window
                // and time until hitting lastmax is 0 since we are past lastmax
                this.K = 0;
                this.originPoint = this.congestionWindow;
            }
            this.ackCnt = 1;
            this.Wtcp = this.congestionWindow;
        }
        //time since last loss event
        //since we are trying to calculate T + RTT add minRTT
        let t = Date.now() + this.RTTMeasurer.minRtt - this.epochStart;
        //set it in seconds
        t = t / 1000;
        // C*(t-K)^3
        let differenceToWmax = CubicCongestionControl.CUBICParameter * Math.pow(t - this.K, 3);
        // the target for the next round trip
        let target = this.originPoint + differenceToWmax;

        VerboseLogging.warn("TARGET IS: " + target + "  ORIGINPOINT IS " + this.originPoint + " DIFFERENCE TO WMAX  " + differenceToWmax + " CONGESTION WINDOW " + this.congestionWindow + " K IS " + this.K + " lasmax is  " + this.WlastMax + " t is " + t);

        let count = 0;

        if(target > this.congestionWindow){
            count = this.congestionWindow / (target - this.congestionWindow);
            VerboseLogging.warn("NORMAL");
        }
        else{
            // make it ridiculously large so the cwndcount will not be larger than this, and thus won't be increased
            // because the congestion window is larger than the target
            // TODO: doublecheck
            count = 100 * this.congestionWindow
            VerboseLogging.warn("OVER 100");
        }
        if(CubicCongestionControl.tcpFriendliness){
            count = this.cubicTcpFriendliness(count);
            VerboseLogging.warn("TCP FRIENDLY");
        }
        VerboseLogging.warn("COUNT IS " + count);
        return count;
    }


    private cubicTcpFriendliness(cubicCount : number) : number {
        this.Wtcp = this.Wtcp + ((3*CubicCongestionControl.kLossReductionFactor) / (2 - CubicCongestionControl.kLossReductionFactor)) * (this.ackCnt/this.congestionWindow);
        this.ackCnt = 0;
        if(this.Wtcp > this.congestionWindow){
            let maxCount = this.congestionWindow/(this.Wtcp-this.congestionWindow);
            return Math.min(cubicCount, maxCount);
        }
        return cubicCount;
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
            this.epochStart = 0;
            //if a loss happened before it reached the last max, there is a good possibility that there is a new sender on the network
            //make extra space
            if(this.congestionWindow < this.WlastMax && CubicCongestionControl.fastConvergence){
                this.WlastMax = this.congestionWindow * ((2-CubicCongestionControl.kLossReductionFactor) / 2);
            }
            else{
                this.WlastMax = this.congestionWindow;
            }
            // why 1 - lossreductionfactor?
            this.congestionWindow = this.congestionWindow * (1-CubicCongestionControl.kLossReductionFactor);
            this.ssthresh = this.congestionWindow;
        }
    }



    /**
     * called when lossdetection detects lost packets
     * @param lostPackets the packets that have been lost
     */     
    private onPacketsLost(lostPackets: SentPacket[]) {
        var largestLostPNum : Bignum = new Bignum(0);
        //time since epoch
        let largestLostTime : number = 0;
        let largestLostPacket! : BasePacket;

        var smallestLostPNum : Bignum = Bignum.infinity();
        //time since epoch
        let smallestLostTime : number = Number.POSITIVE_INFINITY;
        let smallestLostPacket! : BasePacket;

        let totalLostBytes = new Bignum(0);

        lostPackets.forEach((lostPacket: SentPacket) => {
            if (lostPacket.packet.isAckOnly())
                return;

            var packetByteSize = lostPacket.packet.toBuffer(this.connection).byteLength;
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
    }


    /**
     * implementation of the abstract PacketPipe function
     * @param packet packet to enter the congestion control
     */
    public packetIn(packet: BasePacket) {
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


    //TODO REFACTOR:
    // having this.sendpackets() in random places doesn't really make sense to me?
    // find out reason why this is and change it, will probably lead to cleaner system
    
    //This is an ugly solution to keep the bytesinflight+newest packet under cwnd
    // since the packet bytelength (via tobuffer) can not be calculated before having set a pn (for some reason), this is needed
    private alreadySetPn : boolean = false;
    private sendPackets(){
        // TODO: doublecheck if some packets need to be excluded from blocking by CC/pacer
        // update, PTO packets need to not be blocked
        while (this.bytesInFlight.lessThan(this.congestionWindow * CubicCongestionControl.kMaxDatagramSize) && this.packetsQueue.length > 0) {
            var packet: BasePacket | undefined = this.packetsQueue.shift();

            if (packet !== undefined) {
                if(!this.alreadySetPn){
                    this.initPacketNumber(packet);
                    this.alreadySetPn = true;
                }
                if(this.bytesInFlight.add(packet.toBuffer(this.connection).byteLength).lessThan(this.congestionWindow * CubicCongestionControl.kMaxDatagramSize)){
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



    private setCWND(newVal : number){
        let oldVal = this.congestionWindow;
        this.congestionWindow = newVal;

        let congestionState = "Avoidance";
        if(this.inRecovery(Date.now())){
            congestionState = "Recovery";
        }
        if(this.inSlowStart()){
            congestionState = "Slow Start"
        }
        this.connection.getQlogger().onCWNDUpdate(congestionState, (this.congestionWindow * CubicCongestionControl.kMaxDatagramSize).toString(), (oldVal * CubicCongestionControl.kMaxDatagramSize).toString())
    }


    private setBytesInFlight(newVal : Bignum, trigger  : ("PACKET_SENT" | "PACKET_RECEIVED" | "ACK_SENT" | "ACK_RECEIVED" | "PACKET_LOST" | "PACKET_RETRANSMITTED"), additionalData : Object = {}){
        this.bytesInFlight = newVal;
        this.connection.getQlogger().onBytesInFlightUpdate(this.bytesInFlight, new Bignum(this.congestionWindow * CubicCongestionControl.kMaxDatagramSize), trigger, additionalData);
    }
}

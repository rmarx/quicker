import { EventEmitter } from "events";
import { Constants } from "../utilities/constants";
import { Bignum } from "../types/bignum";
import { BasePacket } from "../packet/base.packet";
import { Connection, ConnectionEvent } from "../quicker/connection";
import { QuicLossDetection, QuicLossDetectionEvents } from "../loss-detection/loss.detection.draft18";
import { Socket } from "dgram";
import {PacketType} from '../packet/base.packet';
import { PacketLogging } from "../utilities/logging/packet.logging";
import { VerboseLogging } from "../utilities/logging/verbose.logging"
import { CryptoContext, EncryptionLevel, PacketNumberSpace } from '../crypto/crypto.context';
import { AckFrame } from "../frame/ack";



/**
 * This implementation tries to follow the quic draft (draft-18) as strictly as possible. 
 * Both in terms of variable names and implementation. This is done so for a one-to-one match
 * of code and rfc.
 * Variable name changes will try to be made only for clarity or code style.
 */

export class QuicCongestionControl extends EventEmitter {


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
                                                        Math.max(2*QuicCongestionControl.kMaxDatagramSize, 14600));
    /**
     * The lowest value the window may hit
     */
    private static kMinimumWindow : number = 2 * QuicCongestionControl.kMaxDatagramSize;
    /**
     * Factor by which the congestion window will change
     */
    private static kLossReductionFactor : number = 0.5;
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
    private ecnCeCounter : number;
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
     * @remarks Stores the highest packet number since QUIC monotonically increases packet numbers
     * TODO: double check if this is correct. PN spaces might prohibit this as a measure of time
     */
    private recoveryStartTime : Bignum;
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
     * gets updated to the new state of the pto count of the loss detection
     * TODO: refactor, will not work due to the differing loss detection instances for the pn spaces
     * 
     */
    private pto_count = 0;

    public constructor(connection: Connection, lossDetectionInstances: Array<QuicLossDetection>) {
        super();
        //quic congestion control init
        this.ecnCeCounter = 0; //TODO: is this correct?
        this.congestionWindow = new Bignum(QuicCongestionControl.kInitialWindow);
        this.bytesInFlight = new Bignum(0);
        this.recoveryStartTime = new Bignum(0);
        this.ssthresh = Bignum.infinity();

        //implementation specific init
        this.packetsQueue = [];
        this.connection = connection;
        this.hookCongestionControlEvents(lossDetectionInstances);
    }

    
    private hookCongestionControlEvents(lossDetectionInstances: Array<QuicLossDetection>) {
        
        for( let lossDetection of lossDetectionInstances){
            lossDetection.on(QuicLossDetectionEvents.PACKET_ACKED, (ackedPacket: BasePacket) => {
                this.onPacketAckedCC(ackedPacket);
            });
            lossDetection.on(QuicLossDetectionEvents.PACKETS_LOST, (lostPackets: BasePacket[]) => {
                this.onPacketsLost(lostPackets);
            });
            lossDetection.on(QuicLossDetectionEvents.PTO_PROBE_SEND, (pto_count : number)=>{
                this.pto_count = pto_count;
            });
            lossDetection.on(QuicLossDetectionEvents.ECN_ACK, (frame : AckFrame) => {
                this.ProcessECN(frame);
            });
        }
    }
    
    /**
     * Checks if the system is in the recovery state.
     * @param packetNumber packet number to check
     */
    public inRecovery(packetNumber: Bignum): boolean {
        return packetNumber.lessThanOrEqual(this.recoveryStartTime);
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
            var bytesSent = sentPacket.toBuffer(this.connection).byteLength;
            this.bytesInFlight = this.bytesInFlight.add(bytesSent);
        }
    }


    private onPacketAckedCC(ackedPacket : BasePacket) {
        var bytesAcked = ackedPacket.toBuffer(this.connection).byteLength;
        this.bytesInFlight = this.bytesInFlight.subtract(bytesAcked);

        if(this.inRecovery(ackedPacket.getHeader().getPacketNumber().getValue())){
            // No change in congestion window in recovery period
            return;
        }
        else if(this.inSlowStart()){
            // increase congestion window by ackedPacket bytes
            this.congestionWindow = this.congestionWindow.add(bytesAcked);
        }
        else{
            // in congestion avoidance
            //THOUGHT: change from maxsize -> bytesacked in quic algorithm why?
            let bytesIncrease : Bignum = new Bignum(QuicCongestionControl.kMaxDatagramSize * bytesAcked).divide(this.congestionWindow)
            this.congestionWindow = this.congestionWindow.add(bytesIncrease);
        }
        //THOUGHT: this is here because the bytesinflight only decreases after an ack
        this.sendPackets();
    }

    /**
     * A congestion happened
     * @param sentTime packet number (and implicit the time) of the packet that caused the event
     */
    private congestionEventHappened(sentTime : Bignum){
        // Start new congestion event if the sent time is larger
        // than the start time of the previous recovery epoch.
        if(!this.inRecovery(sentTime)){
            //TODO: a way to get the largest packet number
            // In the RFC the actual timestamp seems to be used
            // but due to monotonically increasing packet numbers it's possible to use that instead
            // or not since it has different packet number spaces?
            //this.recoveryStartTime = Now();  <----------
            this.congestionWindow = this.congestionWindow.multiply(QuicCongestionControl.kLossReductionFactor);
            this.congestionWindow = Bignum.max(this.congestionWindow, QuicCongestionControl.kMinimumWindow);
            this.ssthresh = this.congestionWindow;
            //TODO: find out what this is supposed to do/ how to do this (get ptoCount)
            /*
            if(ptoCount > QuicCongestionControl.kPersistentCongestionThreashold){
                this.congestionWindow = new Bignum(QuicCongestionControl.kMinimumWindow)
            }
            */
        }
    }

    /**
     * 
     * @param ack TODO type? what is this exactly supposed to be passed
     */
    private ProcessECN(ack : AckFrame){
        /** TODO
         * if(ackFrame.ceCounter > this.ecnCeCounter){
         *  this.ecnCeCounter = ackFrame.ceCounter;
         *   this.congestionEventHappened(sent_packets[ack.largest_acked].time_sent)
         * }
         */
    }


    // TODO: REFACTOR: largestLost shouldn't be done on packet number basis since we have separate pn-spaces now! 
    private onPacketsLost(lostPackets: BasePacket[]) {
        var largestLost = new Bignum(0);
        lostPackets.forEach((lostPacket: BasePacket) => {
            if (lostPacket.isAckOnly())
                return;
            var packetByteSize = lostPacket.toBuffer(this.connection).byteLength;
            // Remove lost packets from bytesInFlight.
            this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
            if (lostPacket.getHeader().getPacketNumber().getValue().greaterThan(largestLost)) {
                largestLost = lostPacket.getHeader().getPacketNumber().getValue();
            }
        });
        this.congestionEventHappened(largestLost);
        this.sendPackets();
    }


    public queuePackets(packets: BasePacket[]) {
        this.packetsQueue = this.packetsQueue.concat(packets);
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
        if(this.packetsQueue.length == 0 && this.bytesInFlight.equals(0)){
            this.congestionWindow = new Bignum(QuicCongestionControl.kInitialWindow);
        }
    }



    //TODO REFACTOR:
    // having this.sendpackets() in random places doesn't really make sense to me?
    // find out reason why this is and change it, will probably lead to cleaner system
    private sendPackets(){
        //TODO: perhaps some sort of pipelining functionality?? that way a pacer is easy to implement at later times
        // + a serperate class can be made to handle coalescing https://tools.ietf.org/html/draft-ietf-quic-transport-18#section-12.2 and put into the pipeline
        //https://tools.ietf.org/html/draft-ietf-quic-recovery-18#section-7.8
        // TODO: doublecheck if some packets need to be excluded from blocking by CC/pacer
        // update, PTO packets need to not be blocked
        this.checkIdleConnection();
        while (this.bytesInFlight.lessThan(this.congestionWindow) && this.packetsQueue.length > 0) {
            var packet: BasePacket | undefined = this.packetsQueue.shift();
            if (packet !== undefined) {
                let pnSpace:PacketNumberSpace | undefined = this.getPNSpace(packet);

                if(pnSpace !== undefined){ 
                    packet.getHeader().setPacketNumber( pnSpace.getNext() ); 

                    let DEBUGhighestReceivedNumber = pnSpace.getHighestReceivedNumber();
                    let DEBUGrxNumber = -1;
                    if( DEBUGhighestReceivedNumber !== undefined )
                        DEBUGrxNumber = DEBUGhighestReceivedNumber.getValue().toNumber();

                    VerboseLogging.info("CongestionControl:sendPackets : PN space \"" + PacketType[ packet.getPacketType() ] + "\" TX is now at " + pnSpace.DEBUGgetCurrent() + " (RX = " + DEBUGrxNumber + ")" );
                }
                
                this.sendSingularPacket(packet);
                
            }
        }
    }
    
    /**
     * Send out a singular packet, emit PACKET_SENT
     * @param packet the packet to send
     */
    private sendSingularPacket(packet : BasePacket){
        let pktNumber = packet.getHeader().getPacketNumber();
        VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );

        if( Constants.DEBUG_fakeReorder && packet.getPacketType() == PacketType.Handshake && this.connection.getEndpointType() == EndpointType.Client ){
            // this test case delays the client's handshake packets
            // this leads to 1RTT requests being sent before handshake CLIENT_FINISHED
            // server should buffer the 1RTT request until the handshake is done before replying
            // TODO: move this type of test out of congestion-control into its own thing
            //  FIXME: probably best not to set things directly onto the socket in CongestionControl either... 

            VerboseLogging.warn("CongestionControl:sendPackets : DEBUGGING REORDERED Handshake DATA! Disable this for normal operation!");
            let delayedPacket = packet;

            // Robin start hier//
            // kijk in server logs: opeens sturen we STREAM data in een Handshake packet... geen flauw idee waarom
            setTimeout( () => {
                VerboseLogging.warn("CongestionControl:fake-reorder: sending actual Handshake after delay, should arrive after 1-RTT");
                this.connection.getSocket().send(delayedPacket.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
            
                this.onPacketSentCC(delayedPacket as BasePacket);    
                this.emit(CongestionControlEvents.PACKET_SENT, delayedPacket);
            }, 500);
        }
        else{
            // NORMAL BEHAVIOUR
            VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );
            this.connection.getSocket().send(packet.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
        
            this.onPacketSentCC(packet);    
            this.emit(CongestionControlEvents.PACKET_SENT, packet);
        }         
    }
}





export enum CongestionControlEvents {
    PACKET_SENT = 'cc-packet-sent'
}
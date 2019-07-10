import { EventEmitter } from "events";
import { Constants } from "../utilities/constants";
import { Bignum } from "../types/bignum";
import { BasePacket } from "../packet/base.packet";
import { Connection, ConnectionEvent } from "../quicker/connection";
import { LossDetection, LossDetectionEvents } from "../loss-detection/loss.detection";
import { Socket } from "dgram";
import {PacketType} from '../packet/base.packet';
import { PacketLogging } from "../utilities/logging/packet.logging";
import { VerboseLogging } from "../utilities/logging/verbose.logging"
import { CryptoContext, EncryptionLevel, PacketNumberSpace } from '../crypto/crypto.context';
import { HeaderType } from "../packet/header/base.header";
import { EndpointType } from "../types/endpoint.type";
import { PacketNumber } from "../packet/header/header.properties";


export class CongestionControl extends EventEmitter {

    private connection: Connection;
    private packetsQueue: BasePacket[];

    ///////////////////////////
    // Constants of interest
    ///////////////////////////

    // The default max packet size used for calculating default and minimum congestion windows.
    private static DEFAULT_MSS: number = 1460;
    // Default limit on the amount of outstanding data in bytes.
    private static INITIAL_WINDOW: number = CongestionControl.DEFAULT_MSS * 10;
    // Default minimum congestion window.
    private static MINIMUM_WINDOW: number = CongestionControl.DEFAULT_MSS * 2;
    // Reduction in congestion window when a new loss event is detected.
    private static LOSS_REDUCTION_FACTOR: number = 0.5;

    ///////////////////////////
    // Variables of interest
    ///////////////////////////

    // The sum of the size in bytes of all sent packets
    // that contain at least one retransmittable or PADDING frame, and
    // have not been acked or declared lost.  The size does not include
    // IP or UDP overhead.  Packets only containing ACK frames do not
    // count towards byte_in_flight to ensure congestion control does not
    // impede congestion feedback.
    private bytesInFlight: Bignum;
    // Maximum number of bytes in flight that may be sent.
    private congestionWindow: Bignum;
    // The largest packet number sent when QUIC detects a loss.
    // When a larger packet is acknowledged, QUIC exits recovery.
    private endOfRecovery: Bignum;
    // Slow start threshold in bytes.  When the congestion window
    // is below ssthresh, the mode is slow start and the window grows by
    // the number of bytes acknowledged.
    private sshtresh: Bignum;

    public constructor(connection: Connection, lossDetectionInstances: Array<LossDetection>) {
        super();
        this.connection = connection;
        this.congestionWindow = new Bignum(CongestionControl.INITIAL_WINDOW);
        this.bytesInFlight = new Bignum(0);
        this.endOfRecovery = new Bignum(0);
        this.sshtresh = Bignum.infinity();
        this.packetsQueue = [];
        this.hookCongestionControlEvents(lossDetectionInstances);
    }

    private hookCongestionControlEvents(lossDetectionInstances: Array<LossDetection>) {

        for( let lossDetection of lossDetectionInstances){
            lossDetection.on(LossDetectionEvents.PACKET_ACKED, (ackedPacket: BasePacket) => {
                this.onPacketAcked(ackedPacket);
            });
            lossDetection.on(LossDetectionEvents.PACKETS_LOST, (lostPackets: BasePacket[]) => {
                this.onPacketsLost(lostPackets);
            });
            lossDetection.on(LossDetectionEvents.RETRANSMISSION_TIMEOUT_VERIFIED, () => {
                this.onRetransmissionTimeoutVerified();
            });
        }
    }


    public inRecovery(packetNumber: Bignum): boolean {
        return packetNumber.lessThanOrEqual(this.endOfRecovery);
    }

    private onPacketSent(packetSent: BasePacket) {
        if (!packetSent.isAckOnly()) {
            let bytesSent = packetSent.getBufferedByteLength();
            if( bytesSent < 0 )
                bytesSent = packetSent.toBuffer(this.connection).byteLength;

            // Add bytes sent to bytesInFlight.
            this.bytesInFlight = this.bytesInFlight.add(bytesSent);
        }
    }


    private onPacketAcked(ackedPacket: BasePacket) {
        if (ackedPacket.isAckOnly())
            return;

        let packetByteSize = ackedPacket.getBufferedByteLength();
        if( packetByteSize < 0) 
            packetByteSize = ackedPacket.toBuffer(this.connection).byteLength;

        // Remove from bytesInFlight.
        this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
        if (this.inRecovery(ackedPacket.getHeader().getPacketNumber()!.getValue())) {
            // Do not increase congestion window in recovery period.
            return;
        }
        if (this.congestionWindow.lessThan(this.sshtresh)) {
            // Slow start
            this.congestionWindow = this.congestionWindow.add(packetByteSize);
        } else {
            // Congestion avoidance
            this.congestionWindow = this.congestionWindow.add(new Bignum(CongestionControl.DEFAULT_MSS * packetByteSize).divide(this.congestionWindow));
        }
        this.sendPackets();
    }

    // TODO: REFACTOR: largestLost shouldn't be done on packet number basis since we have separate pn-spaces now! 
    private onPacketsLost(lostPackets: BasePacket[]) {
        var largestLost = new Bignum(0);
        lostPackets.forEach((lostPacket: BasePacket) => {
            if (lostPacket.isAckOnly())
                return;

            var packetByteSize = lostPacket.getBufferedByteLength();
            if( packetByteSize < 0 )
                packetByteSize = lostPacket.toBuffer(this.connection).byteLength;
                
            // Remove lost packets from bytesInFlight.
            this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
            if (lostPacket.getHeader().getPacketNumber()!.getValue().greaterThan(largestLost)) {
                largestLost = lostPacket.getHeader().getPacketNumber()!.getValue();
            }
        });
        // Start a new recovery epoch if the lost packet is larger
        // than the end of the previous recovery epoch.
        if (!this.inRecovery(largestLost)) {
            this.endOfRecovery = largestLost;
            this.congestionWindow = this.congestionWindow.multiply(CongestionControl.LOSS_REDUCTION_FACTOR);
            this.congestionWindow = Bignum.max(this.congestionWindow, CongestionControl.MINIMUM_WINDOW);
            this.sshtresh = this.congestionWindow;
        }
        this.sendPackets();
    }

    private onRetransmissionTimeoutVerified() {
        this.congestionWindow = new Bignum(CongestionControl.MINIMUM_WINDOW);
    }


    public queuePackets(packets: BasePacket[]) {
        this.packetsQueue = this.packetsQueue.concat(packets);
        this.sendPackets();
    }

    private sendPackets() {
        // TODO: allow coalescing of certain packets:
        // https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-4.6

        while (this.packetsQueue.length > 0) {
            let packet: BasePacket | undefined = this.packetsQueue[0];
            if (packet !== undefined) {

                if( !packet.isAckOnly() ){
                    if( this.bytesInFlight.greaterThanOrEqual(this.congestionWindow) ){
                        VerboseLogging.warn("CongestionController:sendPackets: congestion window is full! Packets will not be sent until it goes down. # queued: " + this.packetsQueue.length + " : bytes in flight  : " + this.bytesInFlight.toDecimalString() + " >= " + this.congestionWindow.toDecimalString());
                        break;
                    }
                }

                packet = this.packetsQueue.shift()!;

                let ctx:CryptoContext|undefined = this.connection.getEncryptionContextByPacketType( packet.getPacketType() );

                if( ctx ){ // VNEG and retry packets have no packet numbers
                    let pnSpace:PacketNumberSpace = ctx.getPacketNumberSpace();

                    if( !packet.DEBUG_wasRetransmitted ) // TODO: FIXME: this is actual logic that also needs to stay outside of DEBUG!
                        packet.getHeader().setPacketNumber( pnSpace.getNext(), new PacketNumber( new Bignum(0)) ); // FIXME: actually use largestAcked : pnSpace.getHighestAckedPacket 

                    let DEBUGhighestReceivedNumber = pnSpace.getHighestReceivedNumber();
                    let DEBUGrxNumber = -1;
                    if( DEBUGhighestReceivedNumber !== undefined )
                        DEBUGrxNumber = DEBUGhighestReceivedNumber.getValue().toNumber();

                    VerboseLogging.info("CongestionControl:sendPackets : PN space \"" + PacketType[ packet.getPacketType() ] + "\" TX is now at " + pnSpace.DEBUGgetCurrent() + " (RX = " + DEBUGrxNumber + ")" );
                }

                let pktNumber = packet.getHeader().getPacketNumber();

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
                    
                        this.onPacketSent(delayedPacket as BasePacket);    
                        this.emit(CongestionControlEvents.PACKET_SENT, delayedPacket);
                    }, 500);
                }
                else if( Constants.DEBUG_lossAndDuplicatesInHandshake &&
                         packet.getHeader().getHeaderType() == HeaderType.LongHeader ){

                    // Testing problems during the handshake
                    // we do this differently from 1RTT because we want to have a bit more control of what we drop + handshake problems are often way worse than 1RTT problems
                    if( pktNumber && pktNumber.getValue().toNumber() < 1 && this.connection.getEndpointType() == EndpointType.Server ){
                        // drop all first packets from the server 

                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("CongestionControl:sendPackets : artificially DROPPING LONG HEADER PACKET : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") + " @ " + ( ctx ? ctx!.getAckHandler().DEBUGname : "?") );
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");

                        this.onPacketSent(packet);
                        this.emit(CongestionControlEvents.PACKET_SENT, packet);
                    }
                    else if( pktNumber && pktNumber.getValue().toNumber() < 1 && this.connection.getEndpointType() == EndpointType.Client ){
                        // all first packets from the client ARE sent correctly
                        VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );
                        this.connection.getSocket().send(packet.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
                    
                        this.onPacketSent(packet);
                        this.emit(CongestionControlEvents.PACKET_SENT, packet);

                        /*
                        setTimeout( () => {

                            let ctx:CryptoContext|undefined = this.connection.getEncryptionContextByPacketType( packet!.getPacketType() );

                            VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                            VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                            VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                            VerboseLogging.error("CongestionControl:sendPackets : artificially RE-SENDING LONG HEADER PACKET : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") + " @ " + ( ctx ? ctx!.getAckHandler().DEBUGname : "?") );
                            VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                            VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                            VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");

                            packet!.getHeader().setPacketNumber( ctx!.getPacketNumberSpace().getNext(), new PacketNumber( new Bignum(0) ));
                            this.connection.getSocket().send(packet!.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);


                            this.onPacketSent(packet);
                            this.emit(CongestionControlEvents.PACKET_SENT, packet);
                        }, 500);
                        */
                    }
                    else{
                        VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );
                        this.connection.getSocket().send(packet.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
                    
                        this.onPacketSent(packet);
                        this.emit(CongestionControlEvents.PACKET_SENT, packet);
                    }
                }
                else if( Constants.DEBUG_1RTT_packetLoss_ratio > 0 &&
                         packet.getHeader().getHeaderType() == HeaderType.ShortHeader ){

                    // dropping random 1RTT data packets 
                    let drop = Math.random() < Constants.DEBUG_1RTT_packetLoss_ratio;

                    
                    if( drop ){
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("CongestionControl:sendPackets : artificially DROPPING 1RTT PACKET : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") + " @ " + ( ctx ? ctx!.getAckHandler().DEBUGname : "?") );
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");
                        VerboseLogging.error("///////////////////////////////////////////////////////////////////////////////////////////////");

                        this.onPacketSent(packet);
                        this.emit(CongestionControlEvents.PACKET_SENT, packet);
                    }
                    else{
                        VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );
                        this.connection.getSocket().send(packet.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
                    
                        this.onPacketSent(packet);
                        this.emit(CongestionControlEvents.PACKET_SENT, packet);
                    }
                }
                else{
                    // NORMAL BEHAVIOUR
                    VerboseLogging.info("CongestionControl:sendPackets : actually sending packet : #" + ( pktNumber ? pktNumber.getValue().toNumber() : "VNEG|RETRY") );
                    this.connection.getSocket().send(packet.toBuffer(this.connection), this.connection.getRemoteInformation().port, this.connection.getRemoteInformation().address);
                
                    this.onPacketSent(packet);    
                    this.emit(CongestionControlEvents.PACKET_SENT, packet);
                }                    
            }
        }
    }
}

export enum CongestionControlEvents {
    PACKET_SENT = 'cc-packet-sent'
}
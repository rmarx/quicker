import { EventEmitter } from "events";
import { Constants } from "../utilities/constants";
import { Bignum } from "../types/bignum";
import { BasePacket } from "../packet/base.packet";
import { Connection, ConnectionEvent } from "../quicker/connection";
import { LossDetection, LossDetectionEvents } from "../loss-detection/loss.detection";


export class CongestionControl extends EventEmitter {

    private connection: Connection;

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

    public constructor(connection: Connection, lossDetection: LossDetection) {
        super();
        this.connection = connection;
        this.congestionWindow = new Bignum(CongestionControl.INITIAL_WINDOW);
        this.bytesInFlight = new Bignum(0);
        this.endOfRecovery = new Bignum(0);
        this.sshtresh = Bignum.infinity();
        this.hookCongestionControlEvents(lossDetection);
    }

    private hookCongestionControlEvents(lossDetection: LossDetection) {
        lossDetection.on(LossDetectionEvents.PACKET_ACKED, (ackedPacket: BasePacket) => {
            this.onPacketAcked(ackedPacket);
        });
        lossDetection.on(LossDetectionEvents.PACKETS_LOST, (lostPackets: BasePacket[]) => {
            this.onPacketsLost(lostPackets);
        });
        lossDetection.on(LossDetectionEvents.RETRANSMISSION_TIMEOUT_VERIFIED, () => {
            this.onRetransmissionTimeoutVerified();
        });
        this.connection.on(ConnectionEvent.PACKET_SENT, (sentPacket: BasePacket) => {
            this.onPacketSent(sentPacket);
        });
    }


    public inRecovery(packetNumber: Bignum): boolean {
        return packetNumber.lessThanOrEqual(this.endOfRecovery);
    }

    private onPacketSent(packetSent: BasePacket) {
        if (!packetSent.isAckOnly()) {
            var bytesSent = packetSent.toBuffer(this.connection).byteLength;
            // Add bytes sent to bytesInFlight.
            this.bytesInFlight.add(bytesSent);
        }
    }


    private onPacketAcked(ackedPacket: BasePacket) {
        if (ackedPacket.isAckOnly())
            return;

        var packetByteSize = ackedPacket.toBuffer(this.connection).byteLength;
        // Remove from bytesInFlight.
        this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
        if (ackedPacket.getHeader().getPacketNumber().getPacketNumber().lessThan(this.endOfRecovery)) {
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
    }

    private onPacketsLost(lostPackets: BasePacket[]) {
        var largestLost = new Bignum(0);
        lostPackets.forEach((lostPacket: BasePacket) => {
            if (lostPacket.isAckOnly())
                return;
            var packetByteSize = lostPacket.toBuffer(this.connection).byteLength;
            // Remove lost packets from bytesInFlight.
            this.bytesInFlight = this.bytesInFlight.subtract(packetByteSize);
            if (lostPacket.getHeader().getPacketNumber().getPacketNumber().greaterThan(largestLost)) {
                largestLost = lostPacket.getHeader().getPacketNumber().getPacketNumber();
            }
        });
        // Start a new recovery epoch if the lost packet is larger
        // than the end of the previous recovery epoch.
        if (this.endOfRecovery.lessThan(largestLost)) {
            this.endOfRecovery = largestLost;
            this.congestionWindow = this.congestionWindow.multiply(CongestionControl.LOSS_REDUCTION_FACTOR);
            this.congestionWindow = Bignum.max(this.congestionWindow, CongestionControl.MINIMUM_WINDOW);
            this.sshtresh = this.congestionWindow;
        }
    }

    private onRetransmissionTimeoutVerified() {
        this.congestionWindow = new Bignum(CongestionControl.MINIMUM_WINDOW);
    }

}
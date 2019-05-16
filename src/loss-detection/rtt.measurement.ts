import { Bignum } from '../types/bignum';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { AckFrame } from '../frame/ack';
import { BasePacket } from '../packet/base.packet';
import { SentPacket } from './loss.detection';
import { BN } from 'bn.js';
import { Connection } from '../quicker/connection';
import { Constants } from '../utilities/constants';
import { TransportParameterId } from '../crypto/transport.parameters';
import { HandshakeState } from '../crypto/qtls';

// we extracted this from LossDetection to make it share-able across 
// different lossdetectors for the different Packet Number Spaces
// as they all share the same RTT measurements according to the spec
export class RTTMeasurement{
    
    // TODO: REFACTOR: Make these fields private again and use proper accessors to fetch them
    // TODO: REFACTOR: Why are these all Bignums? shouldn't they just be numbers?

    // we use numbers instead of Bignums here because the BN.js library does not support decimals (e.g., 0.5, 1.2) which we need for calculations
    // this SHOULD NOT be a problem, as if the RTT or ack_delay is every larger dan 53 bits (maximum for JS native number), we have bigger fish to fry
    // The most recent RTT measurement made when receiving an ack for a previously unacked packet.
    public latestRtt!: number;
    // The smoothed RTT of the connection, computed as described in [RFC6298]
    public smoothedRtt: number;
    // The RTT variance, computed as described in [RFC6298]
    public rttVar: number;
    // The minimum RTT seen in the connection, ignoring ack delay.
    public minRtt: number;
    // The maximum ack delay in an incoming ACK frame for this connection. 
    // Excludes ack delays for ack only packets and those that create an RTT sample less than min_rtt.
    // Primarily needed for Tail Loss Probe and non-handshake loss detection, but we keep it in this class because it makes the code a bit easier 
    public maxAckDelay: number;

    // TODO: REFACTOR: instead pass the ack_delay_exponent in + update when it changes 
    private connection!:Connection;

    public constructor(connection:Connection) {
        this.smoothedRtt = 0;
        this.rttVar = 0;
        this.minRtt = Number.MAX_VALUE;
        this.maxAckDelay = 0;

        this.connection = connection; // only used to get ack_delay_exponent
    }

    public updateRTT(receivedAckFrame: AckFrame, largestAcknowledgedPacket:SentPacket){

        this.latestRtt =  (new Date().getTime()) - largestAcknowledgedPacket.time; //new Bignum(new Date().getTime()).subtract(largestAcknowledgedPacket.time);

        this.minRtt = Math.min( this.minRtt, this.latestRtt );//Bignum.min(this.minRtt, this.latestRtt);



        let ackDelay = receivedAckFrame.getAckDelay().toNumber();
        let ackDelayExponent = Constants.DEFAULT_ACK_DELAY_EXPONENT;
        // the ackDelay is an encoded value, using the ack_delay_exponent, so we need to "decode" it 
        // it's a received ACK frame, so it was encoded with the remote's exponent
        // TODO: REFACTOR: this is extremely dirty, shouldn't need to know this here 
        if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            ackDelayExponent = this.connection.getRemoteTransportParameter(TransportParameterId.ACK_DELAY_EXPONENT);
        }

        ackDelay = ackDelay * (2 ** ackDelayExponent);
        ackDelay = ackDelay / 1000; // ackDelay is in MICRO seconds, we do your calculations here in MILLIseconds


        /*
        if (this.latestRtt.subtract(this.minRtt).greaterThan(ackFrame.getAckDelay())) {
            this.latestRtt = this.latestRtt.subtract(ackFrame.getAckDelay());
        }
        */
       if( this.latestRtt - this.minRtt > ackDelay ){
           this.latestRtt = this.latestRtt - ackDelay;
       }

       
        if (largestAcknowledgedPacket.isRetransmittable) {
           // this.maxAckDelay = Bignum.max(this.maxAckDelay, ackFrame.getAckDelay());
           this.maxAckDelay = Math.max( this.maxAckDelay, ackDelay );
        }

        if (this.smoothedRtt == 0) {
            this.smoothedRtt = this.latestRtt;
            this.rttVar = this.latestRtt / 2;
        } else {
            /*
            var rttVarSample: Bignum = Bignum.abs(this.smoothedRtt.subtract(this.latestRtt));
            this.rttVar = this.rttVar.multiply(3 / 4).add(rttVarSample.multiply(1 / 4));
            this.smoothedRtt = this.smoothedRtt.multiply(7 / 8).add(this.latestRtt.multiply(1 / 8));
            */
           let rttVarSample = Math.abs( this.smoothedRtt - this.latestRtt );
           this.rttVar = this.rttVar * 0.75 + rttVarSample * 0.25;
           this.smoothedRtt = this.smoothedRtt * 0.875 + this.latestRtt * 0.125;
        }

        VerboseLogging.info("RTTMeasurerment:updateRTT : latest=" + this.latestRtt + ", smooth="+ this.smoothedRtt +", rttVar=" + this.rttVar + ", maxAckDelay=" + this.maxAckDelay + ". Due to ACK of packet nr " + (largestAcknowledgedPacket.packet.getHeader().getPacketNumber()!.getValue().toNumber()));
        if( this.latestRtt < 1 || this.smoothedRtt < 1 || this.rttVar < 1 || this.maxAckDelay < 1 ){
            VerboseLogging.warn("RTTMeasurerment:updateRTT : something went wrong calculating RTT values, they are too low! latest=" + this.latestRtt + ", smooth="+ this.smoothedRtt +", rttVar=" + this.rttVar + ", maxAckDelay=" + this.maxAckDelay );
        }
        else if( this.latestRtt > 2000 || this.smoothedRtt > 2000 || this.rttVar > 2000 || this.maxAckDelay > 2000 ){
            VerboseLogging.warn("RTTMeasurerment:updateRTT : something went wrong calculating RTT values, they are too high! latest=" + this.latestRtt + ", smooth="+ this.smoothedRtt +", rttVar=" + this.rttVar + ", maxAckDelay=" + this.maxAckDelay );
        }
    }
}

import { CryptoStream } from './crypto.stream'
import { PacketNumber } from '../packet/header/header.properties';
import { AckHandler } from '../utilities/handlers/ack.handler';
import { Bignum } from '../types/bignum';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { LossDetection } from '../loss-detection/loss.detection';
import { PartiallyParsedPacket } from '../utilities/parsers/header.parser';
import { Connection } from '../quicker/connection';
import { Time } from '../types/time';

export enum EncryptionLevel{
    INITIAL,
    ZERO_RTT, // 0 -RTT
    HANDSHAKE,
    ONE_RTT   // 1-RTT
}

export interface BufferedPacket{
    packet: PartiallyParsedPacket,
    connection: Connection,
    receivedTime:Time
}

// CryptoContext helps keep track of the different encryption levels and packet number spaces introduced in draft-13
// In short, all encryption levels act as separate contexts with their own packet numbers starting from 0 and CRYPTO stream offsets starting from 0 as well
// only 0-RTT and 1-RTT share packet numbers, since we reply to 0-RTT requests with 1-RTT data etc. 
/*
    | Packet Type     | Encryption Level | PN Space  | TLS messages
    |:----------------|:-----------------|:----------| --------------
    | Initial         | Initial secrets  | Initial   | ClientHello, ServerHello
    | Retry           | N/A              | N/A       | 
    | 0-RTT Protected | 0-RTT            | 0+1-RTT   | 0-RTT data, END-OF-EARLY-DATA
    | Handshake       | Handshake        | Handshake | Encrypted Extensions, Certificate, Certificate Verify, Finished
    | Short Header    | 1-RTT            | 0+1-RTT   | NewSessionTicket

*/
export class CryptoContext {

    private cryptoLevel!:EncryptionLevel;
    private cryptoStream!:CryptoStream;
    private packetNumberSpace!:PacketNumberSpace; // we have to abstract this because 0-RTT and 1-RTT share a PNS, but have separate crypto levels
    private ackHandler!:AckHandler;
    private lossDetection!:LossDetection;

    // if we receive out-of-order packets for this cryptocontext and thus cannot decode them yet, we buffer them 
    private bufferedPackets!:Array<BufferedPacket>;

    public constructor(cryptoLevel:EncryptionLevel, packetNumberSpace:PacketNumberSpace, ackHandler:AckHandler, lossDetection:LossDetection) {
        this.cryptoLevel = cryptoLevel;
        this.packetNumberSpace = packetNumberSpace;
        this.cryptoStream = new CryptoStream(this.cryptoLevel);
        this.ackHandler = ackHandler;
        this.lossDetection = lossDetection;

        this.bufferedPackets = new Array<BufferedPacket>();
    }

    public getLevel() : EncryptionLevel {
        return this.cryptoLevel;
    }

    public getCryptoStream() : CryptoStream{
        return this.cryptoStream;
    }

    public getPacketNumberSpace(): PacketNumberSpace{
        return this.packetNumberSpace;
    }

    public getAckHandler(): AckHandler{
        return this.ackHandler;
    }

    public getLossDetection():LossDetection{
        return this.lossDetection;
    }

    public bufferPacket( packet:BufferedPacket ){
        this.bufferedPackets.push( packet );
    }

    public getAndClearBufferedPackets():Array<BufferedPacket> {
        let output = this.bufferedPackets;
        this.bufferedPackets = new Array<BufferedPacket>();
        return output;
    }
}

export class PacketNumberSpace{

    private sendingNumber:PacketNumber; // increments with 1 for each packet sent 

    // necessary for decoding numbers because pn encoding uses as little bytes as possible and so requires previous packet numbers for un-ambiguous decoding, see draft-13#4.8 and Appendix A for more info
    private highestReceivedNumber:PacketNumber|undefined; 

    public constructor(){
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("Initializating PN at 130 for testing");
        // //this.sendingNumber = new PacketNumber( new Bignum(130) );
        this.sendingNumber = new PacketNumber( new Bignum(-1) );
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
        // VerboseLogging.fatal("///////////////////////////////////////////////////////////////////////////////");
    }

    // it should never be needed to get the current PacketNumber outside of debugging
    public DEBUGgetCurrent() : number{
        return this.sendingNumber.getValue().toNumber();
    }

    public getNext() : PacketNumber{

        // HERE BE DRAGONS
        // original code:
        //      let bn = this.sendingNumber.getValue().add(1);
        //      this.sendingNumber.setValue( bn )
        //      return this.sendingNumber
        // Internally, Bignum.add() creates a new instance and adds 1
        // However, setValue() on this.sendingNumber of course does NOT create a new object, and we were passing back the same PacketNumber reference everytime
        // since we keep stores of Packets (and thus also headers with PacketNumbers) for loss detection and ack handling etc., these packets were internally being updated with the latest packet number
        // this wreaks havoc when we lookup things in a hash table based on the packet number (i.e., AckHandler did hashMap[packet.header.packetnr], where the packetnr would be erroneous for later packets)

        // New code prevents this by explicitly creating a new PacketNumber every time 
        // TODO: optimize this further... I shouldn't need 2 fully new objects just to update the packet number? 
    
        // TODO: take into account the theoretical maximum of 2^62-1 for packet numbers 
        var bn = this.sendingNumber.getValue().add(1); 
        this.sendingNumber = new PacketNumber( bn );
        return this.sendingNumber;
    }

    public setHighestReceivedNumber(nr:PacketNumber){
        if( this.highestReceivedNumber && nr.getValue().lessThanOrEqual(this.highestReceivedNumber.getValue()) )
            VerboseLogging.error("PacketNumberSpace:setHighestReceivedNumber : next number is equal or less than current setting!");
            
        this.highestReceivedNumber = new PacketNumber( nr.getValue() );
    }

    // TODO: decide if we want this to be a reference or copy and adjust calling code accordingly
    // now we have a reference but are treating it as a copy
    public getHighestReceivedNumber():PacketNumber|undefined{
        return this.highestReceivedNumber;
    }
}
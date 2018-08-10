
import { CryptoStream } from './crypto.stream'
import { PacketNumber } from '../packet/header/header.properties';

export enum EncryptionLevel{
    INITIAL,
    ZERO_RTT, // 0 -RTT
    HANDSHAKE,
    ONE_RTT   // 1-RTT
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
 

    public constructor(cryptoLevel:EncryptionLevel, packetNumberSpace:PacketNumberSpace) {
        this.cryptoLevel = cryptoLevel;
        this.packetNumberSpace = packetNumberSpace;
        this.cryptoStream = new CryptoStream(this.cryptoLevel);
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
}

export class PacketNumberSpace{

    private sendingNumber:PacketNumber; // increments with 1 for each packet sent 

    // necessary for decoding numbers because pn encoding uses as little bytes as possible and so requires previous packet numbers for un-ambiguous decoding, see draft-13#4.8 and Appendix A for more info
    private highestReceivedNumber:PacketNumber|undefined; 

    public constructor(){
        this.sendingNumber = new PacketNumber(-1);
    }

    public getNext() : PacketNumber{
        // TODO: take into account the theoretical maximum of 2^62-1 for packet numbers 
        var bn = this.sendingNumber.getValue().add(1);
        this.sendingNumber.setValue(bn);
        return this.sendingNumber;
    }

    public setHighestReceivedNumber(nr:PacketNumber){
        this.highestReceivedNumber = nr;
    }

    public getHighestReceivedNumber():PacketNumber|undefined{
        return this.highestReceivedNumber;
    }
}
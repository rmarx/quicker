import { Constants } from '../constants';
import { EndpointType } from '../../types/endpoint.type';
import { VLIE } from '../../types/vlie';
import { Connection } from '../../quicker/connection';
import { Bignum } from '../../types/bignum';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { AckFrame, AckBlock } from '../../frame/ack';
import { TimeFormat, Time } from '../../types/time';
import { TransportParameterId } from '../../crypto/transport.parameters';
import { Alarm, AlarmEvent } from '../../types/alarm';
import { PacketFactory } from '../factories/packet.factory';
import { BaseFrame, FrameType } from '../../frame/base.frame';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { HandshakeState } from '../../crypto/qtls';
import { VerboseLogging } from '../logging/verbose.logging';
import { FrameFactory } from '../factories/frame.factory';


interface ReceivedPacket {
    time: Time, // TODO: REFACTOR: replace with timestamp instead of Time Object to reduce memory? 
    ackOnly: boolean // TODO: potentially even use MSB of timestamp to encode ack or not? (highly unlikely server will run for years on end)
}

export class AckHandler {

    public DEBUGname = "";

    private receivedPackets: { [key: string]: ReceivedPacket };
    private largestPacketNumber!: Bignum;
    private alarm: Alarm;
    private ackablePacketsSinceLastAckFrameSent: number = 0; // count of ACK-able packets we have received since the last time we've sent an ACK frame
    private totalPacketsSinceLastAckFrameSent: number = 0;
    // ack wait in ms
    private static readonly ACK_WAIT = 15;

    public constructor(connection: Connection) {
        this.receivedPackets = {};
        this.alarm = new Alarm();
    }

    // transformation from ACK frame contents to actual sent packets for our endpoint is done by the caller of this function
    // (currently, that's LossDetection:determineNewlyAckedPackets)
    // The packet we get in here is already one of the packets we have sent that is ACKed, so NOT the packet containing the other endpoint's ACK frame
    public onPacketAcked(sentPacketIn: BasePacket) {
        // TODO VERIFY: revise logic here maybe? why only vneg? aren't there other types as well? 
        if (sentPacketIn.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }

        // conceptually:
        // - We ourselves send acknowledgements for packets we receive from the other endpoint
        // - Because of packet loss, we cannot just send these ACKs once and be done with it... we have to keep sending ACKs 
        //      for received packets until we are sure the other endpoint has seen those ACKs (or they will retransmit the packets)
        // - How do we know the other endpoint has received our ACKs for their packets? if they in turn ACK our packets containing ACK frames
        //      (yes, this is a bit of a mindf*ck)
        // - Let's use an example to makes things clear:
        //      - Peer sends packet 5 
        //      - We receive packet 5 and add it to "list of things to be ACKed" (see :onPacketReceived)
        //      - We generate ACK frame for packet 5, send it in our packet nr. 20 (we keep 5 in "list of things to be ACKed")
        //      - We keep a copy of packet 20 in loss detection (see LossDetection:onPacketSent)
        //          - we don't keep another copy of our sent packets here, only in loss detection
        //          - here, we only have a list of "things we have received that have yet to be ACKed"
        //      - Peer sends ACK in their packet nr. 6 to us for our packet 20 
        //      - We receive packet 6 and unwrap the ACK frame to find that our packet 20 was acked (see LossDetection:onSentPacketAcked)
        //          - packet 20 is now also removed from our local sent packet list because it was acked (should not be retransmitted, so we have no reason to keep copy)
        //      - We now need to remove packet 5 from our "list of things to be ACKed": that's exactly what this here method does!
        //          - sentPacket is our own packet 20
        //          - We look up which packets our packet 20 was ACKing (see "determineAckedPacketNumbers") and find it's nr. 5 
        //          - this.receivedPackets is the "list of things to be ACKed" and still contains this nr. 5
        //          - since our ACK for received packet 5 was successfully received by the peer (as they have ACKed our packet nr. 20 in turn), we can safely remove it

        // TODO: here, we keep ACKing older packets indefinitely
        // in the spec, it says that upon reception of ACK-of-an-ACK (packet nr. 6 above), we can stop sending everything below the highest ACKed number
        //  -> e.g., if our packet 20 had also acked packet 7 next to 5, we could drop everything below and 7 including 
        //  see draft-15#4.4.3

        let sentPacket = <BaseEncryptedPacket>sentPacketIn;

        sentPacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.getType() === FrameType.ACK) {
                let ackFrame = <AckFrame>frame;
                let packetNumbers = ackFrame.determineAckedPacketNumbers();
                VerboseLogging.info(this.DEBUGname + " ackHandler:onPacketAcked Sent Packet " + sentPacket.getHeader().getPacketNumber()!.getValue().toNumber() + " was acked by peer and contained ACKs for received packets " + (packetNumbers.map((val, idx, arr) => val.toNumber())).join(",") );

                packetNumbers.forEach((packetNumber: Bignum) => {
                    if (this.receivedPackets[packetNumber.toString('hex', 8)] !== undefined) {
                        delete this.receivedPackets[packetNumber.toString('hex', 8)];
                        VerboseLogging.info(this.DEBUGname + " ackHandler:onPacketAcked Received packet " + packetNumber.toNumber() + " is now removed from 'list of things to ack'" );
                    }
                    else{
                        VerboseLogging.info(this.DEBUGname + " ackHandler:onPacketAcked Packet " + packetNumber.toNumber() + " was no longer in this.receivedPackets, previously acked?");
                    }
                });
            }
        });
    }

    public onPacketReceived(connection: Connection, packet: BasePacket, time: Time): void {
        // TODO VERIFY: revise logic here maybe? why only vneg? aren't there other types as well? 
        if (packet.getPacketType() === PacketType.VersionNegotiation) {
            return;
        }
        var header = packet.getHeader();
        var pn = header.getPacketNumber()!.getValue();
        if (this.largestPacketNumber === undefined ||  pn.greaterThan(this.largestPacketNumber)) {
            this.largestPacketNumber = pn;
        }
        
        this.receivedPackets[pn.toString('hex', 8)] = {time: time, ackOnly: packet.isAckOnly()};

        VerboseLogging.info(this.DEBUGname + " AckHandler:onPacketReceived : added packet " + pn.toNumber() + ", ackOnly=" + packet.isAckOnly() );

        ++this.totalPacketsSinceLastAckFrameSent;

        // we should only separately ACK packets containing other stuff than other ACKs and padding
        // the other packets should be acked (so are in this.receivedPackets) but only together with "real" packets
        if( !packet.isAckOnly() && !packet.isPaddingOnly() ){
            ++this.ackablePacketsSinceLastAckFrameSent;
            if( !this.alarm.isRunning() ){
                this.setAlarm(connection); 
                VerboseLogging.info(this.DEBUGname + " AckHandler:onPacketReceived : starting ACK alarm to trigger new ACK frame in " + this.alarm.getDuration() + "ms. " + this.ackablePacketsSinceLastAckFrameSent + " ACK-able packets outstanding.");
            }
        }
        else if( this.ackablePacketsSinceLastAckFrameSent == 0 ){
            this.alarm.reset(); // this SHOULDN'T be running, but just to make sure, let's reset it, ok?
            VerboseLogging.info(this.DEBUGname + " AckHandler:onPacketReceived : no ACK-able packets outstanding, stopping ACK alarm. Total ack-only outstanding: " + this.totalPacketsSinceLastAckFrameSent);
        }
    }



    public getAckFrame(connection: Connection): AckFrame | undefined {

        VerboseLogging.trace(this.DEBUGname + " AckHandler:getAckFrame: START");

        // we only want to generate ACK frames if we have actual ACK-able packets
        // e.g., for ACK-only or PADDING-only packets, we don't want to generate ACK frames
        // TODO: FIXME: limit of 10 is -very- arbitrary and shouldn't even be needed (everything should work without acks of acks), but as a quick fix, this should work
        if( this.totalPacketsSinceLastAckFrameSent < 10 && this.ackablePacketsSinceLastAckFrameSent == 0 ){
            VerboseLogging.trace(this.DEBUGname + " AckHandler:getAckFrame: no new ACK-able packets received since last ACK frame, not generating new one");
            return undefined;
        }

        this.ackablePacketsSinceLastAckFrameSent = 0; // we always ACK all newly received packets
        this.totalPacketsSinceLastAckFrameSent = 0;

        this.alarm.reset();
        /*
        if (Object.keys(this.receivedPackets).length === 0 || this.onlyAckPackets()) {
            VerboseLogging.trace(this.DEBUGname + " AckHandler:getAckFrame: no ack frame to generate : " + Object.keys(this.receivedPackets).length + " || " + this.onlyAckPackets());
            return undefined;
        }
        */

        if (connection.getQuicTLS().getHandshakeState() === HandshakeState.COMPLETED) {
            var ackDelayExponent: number = connection.getRemoteTransportParameter(TransportParameterId.ACK_DELAY_EXPONENT);
        } else {
            var ackDelayExponent: number = Constants.DEFAULT_ACK_DELAY_EXPONENT;
        }

        // TODO: optimize: store largestPacketNumber timing separately so we don't need to do hashmap lookup
        // in that case, we can simply remove the timing from the hashmap alltogether? 
        var ackDelay = Time.now(this.receivedPackets[this.largestPacketNumber.toString('hex', 8)].time).format(TimeFormat.MicroSeconds);
        ackDelay = ackDelay / (2 ** ackDelayExponent);

        var packetnumbers: Bignum[] = [];
        Object.keys(this.receivedPackets).forEach((key) => packetnumbers.push(new Bignum(Buffer.from(key, 'hex'))));
        packetnumbers.sort((a: Bignum, b: Bignum) => {
            return a.compare(b);
        });
        packetnumbers.reverse();
        var latestPacketNumber = this.largestPacketNumber;
        var largestAckedTime = this.receivedPackets[this.largestPacketNumber.toString('hex', 8)];

        var ackBlockCount = 0;
        var blocks = [];
        var gaps = [];
        blocks.push(0);

        
        let numberString:string = "";
        for( let n = 0; n < packetnumbers.length; ++n )
            numberString += "" + packetnumbers[n].toNumber() + ",";

        VerboseLogging.info(this.DEBUGname + " AckHandler:getAckFrame : This ACK frame will contain " + packetnumbers.length + " acked packets, with numbers : " + numberString);
        

        for (var i = 1; i < packetnumbers.length; i++) {
            var bn = packetnumbers[i - 1].subtract(packetnumbers[i]);
            //VerboseLogging.warn("ACK_BLOCK calc: " + packetnumbers[i - 1].toNumber() + " - " + packetnumbers[i].toNumber() + " = " + bn.toNumber() );
            if (bn.compare(new Bignum(1)) !== 0) {
                // spec says "The number of packets in the gap is one higher than the encoded value of the Gap Field."
                // our previous code here was: gaps.push(bn.subtract(1).toNumber());
                // BUT: this is erroneous! because bn is NOT the gap size, but 1 more than the gap size
                // for example: if first packet has nr 3, second nr 1, then bn == 2, while the gap is just size 1 (only packet nr. 2 is missing)
                // for example, if first packet has nr 5, second has nr 2, then bn == 3, while the gap is only size 2 (packets 4 and 3 are missing)
                // so we subtract 2 instead of 1 here
                gaps.push(bn.subtract(2).toNumber());
                ackBlockCount++;
                blocks[ackBlockCount] = 1;
                //VerboseLogging.warn("sub was != 1, so 1 block more: " + ackBlockCount + " -> " + blocks[ackBlockCount] + ", with gap = " + bn.subtract(1).toNumber() );
            } else {
                blocks[ackBlockCount] = blocks[ackBlockCount] + 1;
                //VerboseLogging.warn("sub was == 1, so expand block: " + ackBlockCount + " -> " + blocks[ackBlockCount] );
            }
        }

        var firstAckBlock = new Bignum(blocks[0]);
        var ackBlocks: AckBlock[] = [];
        for (var i = 1; i < blocks.length; i++) {
            //VerboseLogging.warn("FULL ACK BLOCK: gap = " + (new Bignum(gaps[i - 1])).toNumber() + ", ack_block= " + (new Bignum(blocks[i])).toNumber() );
            var ackBlock = new AckBlock(new Bignum(gaps[i - 1]), new Bignum(blocks[i]));
            ackBlocks.push(ackBlock);
        }

        let ackFrame = FrameFactory.createAckFrame(false, latestPacketNumber, new Bignum(ackDelay), new Bignum(ackBlockCount), firstAckBlock, ackBlocks);

        if( Constants.DEBUG_fakeECN ){
            ackFrame = FrameFactory.createAckFrame(true, latestPacketNumber, new Bignum(ackDelay), new Bignum(ackBlockCount), firstAckBlock, ackBlocks);
            ackFrame.setECT0count( new Bignum( Math.round((Math.random() * 200)) ) );
            ackFrame.setECT1count( new Bignum( Math.round((Math.random() * 200)) ) );
            ackFrame.setCEcount( new Bignum( Math.round((Math.random() * 200)) ) );
        }

        return ackFrame;
    }

    private setAlarm(connection: Connection) {
        this.alarm.on(AlarmEvent.TIMEOUT, () => {
            VerboseLogging.debug(this.DEBUGname + " >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>////////////////////////////// AckHandler: ON ALARM "+ this.DEBUGname +" //////////////////////////////// ");
            var ackFrame = this.getAckFrame(connection);
            if (ackFrame !== undefined) {
                connection.queueFrame(ackFrame);
            }
            VerboseLogging.debug(this.DEBUGname + " <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<////////////////////////////// AckHandler: END ALARM "+ this.DEBUGname +" //////////////////////////////// " + ackFrame);

        });
        this.alarm.start(AckHandler.ACK_WAIT);
    }

    /*
    private onlyAckPackets(): boolean {
        var ackOnly = true;
        Object.keys(this.receivedPackets).forEach((key: string) => {
            if (!this.receivedPackets[key].ackOnly) {
                ackOnly = false;
            }
        });
        return ackOnly;
    }
    */

    /*
    private removePacket(packetNumber: Bignum): void {
        if (this.receivedPackets[packetNumber.toString('hex', 8)] !== undefined) {
            delete this.receivedPackets[packetNumber.toString('hex', 8)];
        }
    }
    */

    public reset(): void {
        this.receivedPackets = {};
        this.alarm.reset();
        this.largestPacketNumber = new Bignum(-1);
    }
}
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { QuicError } from '../utilities/errors/connection.error';
import { Bignum } from '../types/bignum';
import { Connection, ConnectionState } from '../quicker/connection';
import { Stream } from '../quicker/stream';
import { BasePacket, PacketType } from '../packet/base.packet';
import { StreamFrame } from '../frame/stream';
import { CryptoFrame } from '../frame/crypto';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { BaseFrame, FrameType } from '../frame/base.frame';
import { StreamBlockedFrame } from '../frame/stream.blocked';
import { PacketFactory } from '../utilities/factories/packet.factory';
import { BlockedFrame } from '../frame/blocked';
import { MaxDataFrame } from '../frame/max.data';
import { FrameFactory } from '../utilities/factories/frame.factory';
import { ShortHeaderPacket } from '../packet/packet/short.header.packet';
import { logMethod } from '../utilities/decorators/log.decorator';
import { TransportParameterId } from '../crypto/transport.parameters';
import { Constants } from '../utilities/constants';
import { HandshakeState } from '../crypto/qtls';
import { CryptoStream } from '../crypto/crypto.stream';
import { EncryptionLevel } from '../crypto/crypto.context';
import { EndpointType } from '../types/endpoint.type';
import { Time, TimeFormat } from '../types/time';
import { ShortHeader } from '../packet/header/short.header';
import { AckHandler } from '../utilities/handlers/ack.handler';
import { PacketNumber } from '../packet/header/header.properties';
import { VerboseLogging } from '../utilities/logging/verbose.logging';


export class FlowControl {

    /**
     * MAJOR REFACTOR TODO: handshake state handling
     * This is incredibly widespread here, using multiple different methods (checking if it is stream 0, checking handshakestate from QTLS), isHandshake bool, ...
     * The real question is: why is this in flow control in the first place?
     * Spec says: https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.1
     * the complete cryptographic handshake message MUST
        fit in a single packet [...]
     * The payload of a UDP datagram carrying the Initial packet MUST be
         expanded to at least 1200 octets (see Section 8), by adding PADDING
        frames to the Initial packet and/or by combining the Initial packet
        with a 0-RTT packet (see Section 4.6).
     * Given this setup, we can take a much easier, directer route for the handshake and do it outside of the general flow control logic, simplifying things greatly
     * This will probably not change in the future either, since the initial data should always fit in a single UDP datagram
     * TODO: check if this is easy to do outside of flow control with early data though... 
     */

    private shortHeaderSize!: number;
    private connection: Connection;
    private bufferedFrames: BaseFrame[];

    public constructor(connection: Connection) {
        this.connection = connection;
        this.bufferedFrames = [];
    }

    public queueFrame(baseFrame: BaseFrame): void {
        VerboseLogging.info("FlowControl:queueFrame : buffering frame for transmission " + FrameType[baseFrame.getType()] );
        VerboseLogging.error("FlowControl:queueFrame : We do not yet know to which EncryptionContext this frame belongs, so we cannot retransmit! TODO IMPLEMENT" );
        console.trace("flowcontrol:queueFrame");
        this.bufferedFrames.push(baseFrame);
    }

    public isAckBuffered(): boolean {
        var containsAck = false;
        this.bufferedFrames.forEach((baseFrame: BaseFrame) => {
            if (baseFrame.getType() === FrameType.ACK) {
                containsAck = true;
            }
        });
        return containsAck;
    }   

    public getPackets(): BasePacket[] {
        var packets = new Array<BasePacket>();

        // TODO: calculate maxpacketsize better
        if (this.connection.getQuicTLS().getHandshakeState() !== HandshakeState.COMPLETED) {
            var maxPayloadSize = new Bignum(Constants.INITIAL_MIN_SIZE);
        } else {
            if (this.shortHeaderSize === undefined) {
                // TODO: this always leaves 2-3 bytes on the table if the packet number is smaller than the max of 4 bytes!
                let shortHeaderMax = new ShortHeader(this.connection.getDestConnectionID(), false, this.connection.getSpinBit());
                shortHeaderMax.setPacketNumber( new PacketNumber( new Bignum(0x0fffffff) ), new PacketNumber(new Bignum(0)) );
                this.shortHeaderSize = shortHeaderMax.getSize();
            }
            var maxPayloadSize = new Bignum(this.connection.getRemoteTransportParameter(TransportParameterId.MAX_PACKET_SIZE) - this.shortHeaderSize);
        }
        
        var frames = this.getFrames(maxPayloadSize);
        var packetFrames = new Array<BaseFrame>();
        var size = new Bignum(0);


        var ackBuffered: boolean = this.isAckBuffered();
        if( ackBuffered )
            VerboseLogging.error("FlowControl:getPackets: we had buffered ack packets! SHOULD NOT HAPPEN!");

        /*
        if ( !this.connection.connectionIsClosingOrClosed() ) {
            var ackFrame = this.ackHandler.getAckFrame(this.connection);
            if (ackFrame !== undefined) {
                packets.push(this.createNewPacket([ackFrame]));
                packetFrames.push( ackFrame );
            }
        }
        */

        if( frames.handshakeFrames.length > 0 ){
            VerboseLogging.error("FlowControl:getPackets : data shouldn't be in stream 0 anymore!!! !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        }
        else{
            let DEBUGcryptoFrameCount:number = 0;
            let DEBUGackFrameCount:number = 0;
            // getCryptoStreamFrames' output is already scaled to maxPayloadSize, so we create a single packet per frame
            // TODO: this is sub-optimal if we can add things like flow control or 0-RTT requests in the same packet : enable that! 
            // logic below uses an array they fill with frames, maybe move that up to above? 

            // REFACTOR TODO: should only send 3 handshake packets without client address validation
            // https://tools.ietf.org/html/draft-ietf-quic-transport#section-4.4.3
            // REFACTOR TODO: allow coalescing of ACKS together with other packets of the same encryption level
            let initCTX = this.connection.getEncryptionContext(EncryptionLevel.INITIAL);
            let cfrs = this.getCryptoStreamFrames( initCTX!.getCryptoStream(), maxPayloadSize );
            DEBUGcryptoFrameCount += cfrs.length;
            for( let frame of cfrs )
                packets.push( PacketFactory.createInitialPacket(this.connection, [frame]) );
            let ackframe = initCTX!.getAckHandler().getAckFrame(this.connection);
            if( ackframe !== undefined ){
                if( this.connection.getAEAD().canClearTextEncrypt(this.connection.getEndpointType()) ){
                    DEBUGackFrameCount++;
                    packets.push(PacketFactory.createInitialPacket(this.connection, [ackframe]));
                }
                else
                    VerboseLogging.error("FlowControl:getPackets : cannot encrypt initial packets yet! TODO: buffer, dropping for now");
            }


            let zeroCTX = this.connection.getEncryptionContext(EncryptionLevel.ZERO_RTT);
            cfrs = this.getCryptoStreamFrames( zeroCTX!.getCryptoStream(), maxPayloadSize );
            DEBUGcryptoFrameCount += cfrs.length;
            for( let frame of cfrs )
                packets.push( PacketFactory.createProtected0RTTPacket(this.connection, [frame]) );
            /*
            // ACKS for 0RTT are always sent in 1RTT packets (and they share the same Packet Number Space, so also the same ACK handler etc.)
            ackframe = zeroCTX.getAckHandler().getAckFrame(this.connection);
            if( ackframe !== undefined ){
                DEBUGackFrameCount++;
                packets.push(PacketFactory.createProtected0RTTPacket(this.connection, [ackframe]));
            }
            */

            
            let handshakeCTX = this.connection.getEncryptionContext(EncryptionLevel.HANDSHAKE);
            cfrs = this.getCryptoStreamFrames( handshakeCTX!.getCryptoStream(), maxPayloadSize );
            DEBUGcryptoFrameCount += cfrs.length;
            for( let frame of cfrs )
                packets.push( PacketFactory.createHandshakePacket(this.connection, [frame]) );
            ackframe = handshakeCTX!.getAckHandler().getAckFrame(this.connection);
            if( ackframe !== undefined ){
                if( this.connection.getAEAD().canHandshakeEncrypt(this.connection.getEndpointType()) ){
                    DEBUGackFrameCount++;
                    packets.push(PacketFactory.createHandshakePacket(this.connection, [ackframe]));
                }
                else
                    VerboseLogging.error("FlowControl:getPackets : cannot encrypt Handshake packets yet! TODO: buffer, dropping for now");
            }


            let oneCTX = this.connection.getEncryptionContext(EncryptionLevel.ONE_RTT);
            cfrs = this.getCryptoStreamFrames( oneCTX!.getCryptoStream(), maxPayloadSize );
            DEBUGcryptoFrameCount += cfrs.length;
            for( let frame of cfrs )
                packets.push( PacketFactory.createShortHeaderPacket(this.connection, [frame]) );
            ackframe = oneCTX!.getAckHandler().getAckFrame(this.connection);
            if( ackframe !== undefined ){
                if( this.connection.getAEAD().can1RTTEncrypt(this.connection.getEndpointType()) ){
                    DEBUGackFrameCount++;
                    packets.push(PacketFactory.createShortHeaderPacket(this.connection, [ackframe])); 
                }
                else
                    VerboseLogging.error("FlowControl:getPackets : cannot encrypt 1RTT packets yet! TODO: buffer, dropping for now");
            }

            VerboseLogging.info("FlowControl:getPackets : created " + DEBUGcryptoFrameCount + " CRYPTO frames");
        }

        /*
        frames.handshakeFrames.forEach((frame: BaseFrame) => {
            // handshake frames are only more than one with server hello and they need to be in different packets
            // TODO: draft-13 : this is no longer correct, same encryption level can be in same packet
            packets.push(this.createNewPacket([frame]));
        });
        */

        if (this.connection.getQuicTLS().getHandshakeState() >= HandshakeState.CLIENT_COMPLETED) {
            frames.flowControlFrames.forEach((frame: BaseFrame) => {
                var frameSize = frame.toBuffer().byteLength
                if (size.add(frameSize).greaterThan(maxPayloadSize) && !size.equals(0)) {
                    packets.push(this.createNewPacket(packetFrames));
                    size = new Bignum(0);
                    packetFrames = [];
                }
                size = size.add(frameSize);
                packetFrames.push(frame);
            });
        }

        var bufferedFrame: BaseFrame | undefined = this.bufferedFrames.shift();
        while (bufferedFrame !== undefined) {
            var frameSize = bufferedFrame.toBuffer().byteLength;
            if (size.add(frameSize).greaterThan(maxPayloadSize) && !size.equals(0)) {
                packets.push(this.createNewPacket(packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(bufferedFrame);
            bufferedFrame = this.bufferedFrames.shift();
        }

        frames.streamFrames.forEach((frame: BaseFrame) => {
            var frameSize = frame.toBuffer().byteLength;
            if (size.add(frameSize).greaterThan(maxPayloadSize) && !size.equals(0)) {
                packets.push(this.createNewPacket(packetFrames));
                size = new Bignum(0);
                packetFrames = [];
            }
            size = size.add(frameSize);
            packetFrames.push(frame);
        });
        if (packetFrames.length > 0) {
            packets.push(this.createNewPacket(packetFrames));
        }

        return packets;
    }

    private serverHasSentInitial:boolean = false;

    private createNewPacket(frames: BaseFrame[]) {
        var handshakeState = this.connection.getQuicTLS().getHandshakeState();
        
        var isServer = this.connection.getEndpointType() !== EndpointType.Client;
        var isCryptoFrame = false;
        var streamData = false;
        frames.forEach((frame: BaseFrame) => {
            if (frame.getType() >= FrameType.STREAM && frame.getType() <= FrameType.STREAM_MAX_NR) {
                streamData = true;
            }
            if( frame.getType() == FrameType.CRYPTO ) // TODO: update logic: CRYPTO can be sent after handshake as well, obviously
                isCryptoFrame = true;
        });
        

        // during handshake, it SHOULD be quite simple:
        // - All handshake data is in Crypto frames
        // - The only special thing is 0-RTT requests, which are in Stream frames, for which we need to check 

        if (handshakeState !== HandshakeState.COMPLETED) { 
            // REFACTOR TODO: make it A LOT clearer what the different states are right here...
            // afaik:
            // 1. client -> server: sending early data
            // 2. client -> server: first packet ever sent (Initial) -> ideally, this should be the first if-test then...
            // 3. client -> server 
                // 3.1 IF session is being reused : same as 1.
                // 3.2 step "3" in the handshake process: client is fully setup but haven't heard final from server yet : normal data from client -> server
            // 4. server -> client: handhsake packet in response to clientInitial 
            if (this.connection.getQuicTLS().isEarlyDataAllowed() && !isCryptoFrame && !isServer && streamData) {
                return PacketFactory.createProtected0RTTPacket(this.connection, frames);
            } //else if (this.connection.getStreamManager().getStream(new Bignum(0)).getLocalOffset().equals(0) && !isServer && isHandshake) {
              //  return PacketFactory.createInitialPacket(this.connection, frames);
            //} 
            else if(isServer && isCryptoFrame && !this.serverHasSentInitial){
                this.serverHasSentInitial = true; // TODO: FIXME: this is dirty and should be corrected ASAP! 
                return PacketFactory.createInitialPacket(this.connection, frames);
                
            }else if (!isCryptoFrame && ((this.connection.getQuicTLS().isEarlyDataAllowed() && this.connection.getQuicTLS().isSessionReused()) || (handshakeState >= HandshakeState.CLIENT_COMPLETED))) {
                return PacketFactory.createShortHeaderPacket(this.connection, frames); 
            } else {
                return PacketFactory.createHandshakePacket(this.connection, frames);
            }
        } else {
            return PacketFactory.createShortHeaderPacket(this.connection, frames);
        }
    }

    // get frames that need to be SENT to our peer 
    // primarily: STREAM frames with data and flow control frames
    // ACK and CRYPTO etc. frames are done elsewhere 
    public getFrames(maxPayloadSize: Bignum): FlowControlFrames {
        var streamFrames = new Array<StreamFrame>();
        var flowControlFrames = new Array<BaseFrame>();
        var handshakeFrames = new Array<CryptoFrame>(); // TODO: this cannot be returned from here, so don't indicate that it could 
        var uniAdded = false;
        var bidiAdded = false;

        // 3 types of flow control:
        //   1. connection level DATA
        //   2. stream level DATA
        //   3. stream level ID (can only open so many individual streams)
        // These can block data transmission, but should generate feedback to the other peer (BLOCKED, STREAM_BLOCKED or STREAM_ID_BLOCKED frames)
        // These feedback frames request additional allowances from the peer
        // 1.
        let connectionLevelBlocked = this.connection.ableToSend();
        if( connectionLevelBlocked ){
            flowControlFrames.push(FrameFactory.createBlockedFrame(this.connection.getRemoteOffset()));
        }

        // per-stream
        this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            let dataBlocked = connectionLevelBlocked;

            // 2. 
            // TODO: check if we're allowed to send these messages if the conn-level flow control maximum is exceeded
            if ( !stream.isReceiveOnly() && stream.ableToSend()) { 
                if( !stream.getBlockedSent() ){ // keep track of if we've already sent a STREAM_BLOCKED frame for this stream
                    flowControlFrames.push(FrameFactory.createStreamBlockedFrame(stream.getStreamID(), stream.getRemoteOffset()));
                    stream.setBlockedSent(true); // is un-set when we receive MAX_STREAM_DATA frame from peer 
                }
                dataBlocked = true;
            } 

            // 3.
            // TODO: check if we're allowed to send these messages if the conn-level flow control maximum is exceeded
            if (this.isRemoteStreamIdBlocked(stream)) {
                if (!uniAdded && Stream.isUniStreamId(stream.getStreamID())) {
                    // TODO: shouldn't we set a state boolean somewhere that we've requested an update? see stream.setBlockedSent above for something similar
                    var frame = this.addRemoteStreamIdBlocked(stream); 
                    flowControlFrames.push(frame);
                    uniAdded = true;
                } 
                else if (!bidiAdded && Stream.isBidiStreamId(stream.getStreamID())) {
                    var frame = this.addRemoteStreamIdBlocked(stream);
                    flowControlFrames.push(frame);
                    bidiAdded = true;
                }

                dataBlocked = true;
            }

            if( !dataBlocked ){
                // no type of flow control is stopping us from sending, so let's get the data frames! 
                if (stream.getOutgoingDataSize() !== 0) {
                    streamFrames = streamFrames.concat(this.getStreamFrames(stream, maxPayloadSize));
                }
            }
        });

        // We also impose our own flow control limits on the peer (peer cannot send more than we allow)
        // This checks if our own allowances are almost up and, if yes, generates MAX_DATA, MAX_STREAM_DATA and MAX_STREAM_ID frames
        flowControlFrames = flowControlFrames.concat(this.getLocalFlowControlFrames());

        return {
            streamFrames: streamFrames,
            flowControlFrames: flowControlFrames,
            handshakeFrames: handshakeFrames
        };
    }

    private getCryptoStreamFrames( stream: CryptoStream, maxPayloadSize: Bignum ): Array<CryptoFrame>{
        let output:Array<CryptoFrame> = new Array<CryptoFrame>();

        let streamDataSize = maxPayloadSize.lessThan(stream.getOutgoingDataSize()) ? maxPayloadSize : new Bignum(stream.getOutgoingDataSize());

        while( stream.getOutgoingDataSize() > 0 ){
            let streamData = stream.popData( streamDataSize.toNumber() );
            let frame = (FrameFactory.createCryptoFrame(streamData.slice(0, streamDataSize.toNumber()), stream.getRemoteOffset()));
            frame.setCryptoLevel( stream.getCryptoLevel() );
            output.push(frame);

            stream.addRemoteOffset(streamDataSize);
        }
        
        return output;
    }

    private getStreamFrames(stream: Stream, maxPayloadSize: Bignum): Array<StreamFrame> {
        let streamFrames = new Array<StreamFrame>();

        // TODO: is this really needed every time? there shouldn't be anything in the data to begin with...
        //if (stream.isReceiveOnly()) {
        //    stream.resetData();
        //}

        while (stream.getOutgoingDataSize() > 0 && !stream.ableToSend() && !this.connection.ableToSend()) {
            let streamDataSize = maxPayloadSize.lessThan(stream.getOutgoingDataSize()) ? maxPayloadSize : new Bignum(stream.getOutgoingDataSize());

            // adhere to current connection-level and then stream-level flow control max-data limits
            streamDataSize = streamDataSize.greaterThan(this.connection.getSendAllowance().subtract(this.connection.getRemoteOffset())) ? this.connection.getSendAllowance().subtract(this.connection.getRemoteOffset()) : streamDataSize;
            streamDataSize = streamDataSize.greaterThan(stream.getSendAllowance().subtract(stream.getRemoteOffset())) ? stream.getSendAllowance().subtract(stream.getRemoteOffset()) : streamDataSize;


            let streamData = stream.popData(streamDataSize.toNumber());
            let isFin = stream.getFinalSentOffset() !== undefined ? stream.getFinalSentOffset().equals(stream.getRemoteOffset().add(streamDataSize)) : false;
            let frame = (FrameFactory.createStreamFrame(stream.getStreamID(), streamData.slice(0, streamDataSize.toNumber()), isFin, true, stream.getRemoteOffset()));
        
            streamFrames.push(frame);

            // update flow control limits 
            stream.addRemoteOffset(streamDataSize);
            this.connection.addRemoteOffset(streamDataSize);
        } 

        return streamFrames;
    }

    private getLocalFlowControlFrames(): BaseFrame[] {
        if (this.connection.getQuicTLS().getHandshakeState() === HandshakeState.SERVER_HELLO) {
            return [];
        }
        var frames = new Array<BaseFrame>();
        if (this.connection.isPeerAlmostBlocked() || this.connection.isPeerBlocked()) {
            var newMaxData = this.connection.increaseReceiveAllowance();
            frames.push(FrameFactory.createMaxDataFrame(newMaxData));
            this.connection.setPeerBlocked(false);
        }

        this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            if (stream.isUniStream() === true && stream.isLocalStream() === true) {
                return;
            }
            if (stream.isPeerAlmostBlocked() || stream.isPeerBlocked()) {
                var newMaxStreamData = stream.increaseReceiveAllowance();
                frames.push(FrameFactory.createMaxStreamDataFrame(stream.getStreamID(), newMaxStreamData));
                stream.setPeerBlocked(false);
            }
        });

        frames = frames.concat(this.checkLocalStreamId());
        return frames;
    }


    private checkLocalStreamId(): BaseFrame[] {
        var frames = new Array<BaseFrame>();
        this.connection.getStreamManager().getStreams().forEach((stream: Stream) => {
            var streamId = stream.getStreamID();
            if (this.isRemoteStreamId(streamId)) {
                return;
            }
            var newStreamId = undefined;
            let streamType:FrameType = FrameType.UNKNOWN;
            if (Stream.isUniStreamId(streamId)) {
                if (streamId.add(Constants.DEFAULT_MAX_STREAM_ID_BUFFER_SPACE).greaterThanOrEqual(this.connection.getLocalMaxStreamUni().multiply(4))) {
                    newStreamId = this.connection.getLocalMaxStreamUni().add(Constants.DEFAULT_MAX_STREAM_ID_INCREMENT);
                    this.connection.setLocalMaxStreamUni(newStreamId);
                    streamType = FrameType.MAX_STREAMS_UNI;
                }
            } else {
                if (streamId.add(Constants.DEFAULT_MAX_STREAM_ID_BUFFER_SPACE).greaterThanOrEqual(this.connection.getLocalMaxStreamBidi().multiply(4))) {
                    newStreamId = this.connection.getLocalMaxStreamBidi().add(Constants.DEFAULT_MAX_STREAM_ID_INCREMENT);
                    this.connection.setLocalMaxStreamBidi(newStreamId);
                    streamType = FrameType.MAX_STREAMS_BIDI;
                }
            }
            if (newStreamId !== undefined && streamType !== FrameType.UNKNOWN) {
                frames.push(FrameFactory.createMaxStreamIdFrame(streamType, newStreamId));
            }
        });

        return frames;
    }

    private isRemoteStreamId(streamId: Bignum): boolean {
        if (this.connection.getEndpointType() === EndpointType.Server) {
            return streamId.and(new Bignum(0x1)).equals(1);
        }
        return streamId.and(new Bignum(0x1)).equals(0);
    }


    private isRemoteStreamIdBlocked(stream: Stream): boolean {
        if (!this.isRemoteStreamId(stream.getStreamID())) {
            return false;
        }
        var streamId = stream.getStreamID();
        if (Stream.isUniStreamId(streamId)) {
            return streamId.greaterThan(this.connection.getRemoteMaxStreamUni());
        } else {
            return streamId.greaterThan(this.connection.getRemoteMaxStreamBidi());
        }
    }

    private addRemoteStreamIdBlocked(stream: Stream): BaseFrame {
        var streamId = stream.getStreamID();
        if (Stream.isUniStreamId(streamId)) {
            return FrameFactory.createStreamIdBlockedFrame(FrameType.STREAMS_BLOCKED_UNI, this.connection.getRemoteMaxStreamUni());
        } else { 
            return FrameFactory.createStreamIdBlockedFrame(FrameType.STREAMS_BLOCKED_BIDI, this.connection.getRemoteMaxStreamBidi());
        }
    }
}

export interface FlowControlFrames {
    streamFrames: StreamFrame[],
    flowControlFrames: BaseFrame[],
    handshakeFrames: CryptoFrame[]
};
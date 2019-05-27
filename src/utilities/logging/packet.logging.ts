import { EndpointType } from '../../types/endpoint.type';
import { Constants } from '../constants';
import { HandshakeState, TLSMessageType } from '../../crypto/qtls';
import { PacketNumber, Version } from '../../packet/header/header.properties';
import { Bignum } from '../../types/bignum';
import { Connection } from '../../quicker/connection';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { ConsoleColor } from './colors';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { BaseFrame, FrameType } from '../../frame/base.frame';
import { PaddingFrame } from '../../frame/padding';
import { RstStreamFrame } from '../../frame/rst.stream';
import { ConnectionCloseFrame, ApplicationCloseFrame } from '../../frame/close';
import { MaxDataFrame } from '../../frame/max.data';
import { MaxStreamFrame } from '../../frame/max.stream';
import { MaxStreamIdFrame } from '../../frame/max.stream.id';
import { PingFrame } from '../../frame/ping';
import { BlockedFrame } from '../../frame/blocked';
import { StreamBlockedFrame } from '../../frame/stream.blocked';
import { StreamIdBlockedFrame } from '../../frame/stream.id.blocked';
import { NewConnectionIdFrame } from '../../frame/new.connection.id';
import { StopSendingFrame } from '../../frame/stop.sending';
import { AckFrame, AckBlock } from '../../frame/ack';
import { CryptoFrame } from '../../frame/crypto';
import { StreamFrame } from '../../frame/stream';
import { configure, getLogger, Logger } from 'log4js';
import { TransportParameterId } from '../../crypto/transport.parameters';
import { HeaderType, BaseHeader } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { VersionNegotiationPacket } from '../../packet/packet/version.negotiation';
import { PathChallengeFrame, PathResponseFrame } from '../../frame/path';
import { ShortHeader } from '../../packet/header/short.header';
import { VersionNegotiationHeader } from '../../packet/header/version.negotiation.header';
import { VerboseLogging } from './verbose.logging';
import { QuicErrorCode, ConnectionErrorCodes } from '../errors/quic.codes';



export class PacketLogging {

    private static logger: PacketLogging;
    private startOutput: Logger;
    //private continuedOutput: Logger;

    private receivedPacketTypes: Map<string, Map<string, number>>;
    private sentPacketTypes: Map<string, Map<string, number>>; 

    public static getInstance(): PacketLogging {
        if (this.logger === undefined) {
            this.logger = new PacketLogging();
        }
        return this.logger;
    }


    private constructor() {
        
        VerboseLogging.getInstance(); // make sure VerboseLogging is created, since it initializes log4js properly 
        
        this.startOutput = getLogger();
        this.startOutput.level = Constants.LOG_LEVEL;

        this.receivedPacketTypes = new Map<string, Map<string, number>>();
        this.sentPacketTypes = new Map<string, Map<string, number>>();
    }

    public logIncomingPacket(connection: Connection, basePacket: BasePacket) {
        var log = this.logPackets(connection, basePacket, "RX", ConsoleColor.FgCyan);
        this.startOutput.info("\n" + log);

		// We want to log packets per connection so we can print that info later
		// we always log from the perspective of the "sender", so for incoming, we need the DestinationConnID
		// NOTE: for ClientHello, the client guesses a DCID, and the server will send the real one afterwards
		// so, at server side, the client's INITIAL and 0-RTT packets will be in a separate DCID than the rest, take that into account when logging! 
        let connectionID = "";
        let header = basePacket.getHeader();
		if (header.getHeaderType() === HeaderType.LongHeader || header.getHeaderType() === HeaderType.VersionNegotiationHeader) {
            let dheader = header.getHeaderType() === HeaderType.LongHeader ? <LongHeader>header : <VersionNegotiationHeader>header;
            connectionID = dheader.getDestConnectionID().toString();
        } else {
            connectionID = (<ShortHeader>header).getDestConnectionID().toString();
        }

		let connectionIDMap = this.receivedPacketTypes.get( connectionID.toString() );
		if( connectionIDMap == undefined )
			connectionIDMap = new Map<string,number>();

        let currentValue:number = connectionIDMap.get("" + PacketType[basePacket.getPacketType()]) || 0;
        connectionIDMap.set("" + PacketType[basePacket.getPacketType()],  currentValue + 1 );

		this.receivedPacketTypes.set( connectionID.toString(), connectionIDMap );
    }

    public logOutgoingPacket(connection: Connection, basePacket: BasePacket) {
        var log = this.logPackets(connection, basePacket, "TX", ConsoleColor.FgRed);
        this.startOutput.info("\n" + log);
        

		// We want to log packets per connection so we can print that info later
		// we always log from the perspective of the "sender", so for sending, we need the SourceConnID
        let connectionID = connection.getSrcConnectionID();

		let connectionIDMap = this.sentPacketTypes.get( connectionID.toString() );
		if( connectionIDMap == undefined )
			connectionIDMap = new Map<string,number>();

        let currentValue:number = connectionIDMap.get("" + PacketType[basePacket.getPacketType()]) || 0;
        connectionIDMap.set("" + PacketType[basePacket.getPacketType()],  currentValue + 1 );

		this.sentPacketTypes.set( connectionID.toString(), connectionIDMap );
    }

    private logConnectionIds(log: string, header: BaseHeader): string {
        if (header.getHeaderType() === HeaderType.LongHeader || header.getHeaderType() === HeaderType.VersionNegotiationHeader) {
            var dheader = header.getHeaderType() === HeaderType.LongHeader ? <LongHeader>header : <VersionNegotiationHeader>header;
            var destConnectionID = dheader.getDestConnectionID();
            log += ", Dest CID: 0x" + destConnectionID.toString();
            var srcConnectionID = dheader.getSrcConnectionID();
            log += ", Src CID: 0x" + srcConnectionID.toString();
        } else {
            var connectionID = (<ShortHeader>header).getDestConnectionID();
            log += ", Dest CID: 0x" + connectionID.toString();
        }
        return log;
    }

    private logPackets(connection: Connection, basePacket: BasePacket, direction: string, color: ConsoleColor): string {
        var log = "";
        var header = basePacket.getHeader();

        if( basePacket.DEBUG_wasRetransmitted ){
            log += this.getSpaces(2) + color + "RETRANSMITTED from " + basePacket.DEBUG_originalPacketNumber.getValue().toDecimalString() + ConsoleColor.Reset + "\n";
        }
        log += this.getSpaces(2) + color + direction + " " + PacketType[basePacket.getPacketType()] + "(0x" + basePacket.getPacketType() + ")" + ConsoleColor.Reset;
        
        if (header.getHeaderType() === HeaderType.LongHeader) {
            log += ", Version: 0x" + (<LongHeader>header).getVersion().getValue().toString();
        }
        log = this.logConnectionIds(log, header);
        if (basePacket.getPacketType() !== PacketType.VersionNegotiation) {
            log += color + "\n" + this.getSpaces(6) + " PKN: " + basePacket.getHeader().getPacketNumber()!.getValue().toDecimalString() + ConsoleColor.Reset;
        }

        if (header.getHeaderType() === HeaderType.LongHeader) {
            var payloadLength = (<LongHeader>header).getPayloadLength() as Bignum;
            log += ", payload length: ";
            log += payloadLength.toDecimalString();
        } else if (header.getHeaderType() === HeaderType.ShortHeader){
            var spinbit = (<ShortHeader>header).getSpinBit();
            log += ", spinbit: " + (spinbit ? 1 : 0);
        }


        switch (basePacket.getPacketType()) { 
            case PacketType.VersionNegotiation:
                var vnPacket: VersionNegotiationPacket = <VersionNegotiationPacket>basePacket;
                log += this.logVersionNegotiationPacket(vnPacket);
                break;
            case PacketType.Initial:
            case PacketType.Protected0RTT:
            case PacketType.Retry:
            case PacketType.Handshake:
            case PacketType.Protected1RTT:
                var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>basePacket;
                log += this.logFrames(connection, baseEncryptedPacket, color);
        }
        return log;
    }

    private logVersionNegotiationPacket(vnPacket: VersionNegotiationPacket): string {
        var log = "";
        vnPacket.getVersions().forEach((version: Version) => {
            log += "\n";
            log += this.getSpaces(4) + "version: 0x" + version.toString();
        });
        return log;
    }

    private logFrames(connection: Connection, baseEncryptedPacket: BaseEncryptedPacket, color: ConsoleColor): string {
        var log = "";
        baseEncryptedPacket.getFrames().forEach((baseFrame) => {
            log += "\n";
            log += this.logFrame(connection, baseFrame, color);
        });
        return log;
    }

    public logFrame(connection: Connection, baseFrame: BaseFrame, color: ConsoleColor): string {
        var log = "";

        // STREAM frames are dealt with separately below 
        if ( !(baseFrame.getType() >= FrameType.STREAM && baseFrame.getType() <= FrameType.STREAM_MAX_NR)) {
            // ACK_ECN frames look like normal ACK frames for us, but we of course want them to be displayed properly
            let frameType = baseFrame.getType();
            if( frameType == FrameType.ACK ){
                let ackFrame = <AckFrame> baseFrame;
                if( ackFrame.containsECNinfo() )
                    frameType = FrameType.ACK_ECN;
            }
            log += this.getSpaces(4) + color + FrameType[frameType] + " (0x" + frameType.toString(16) + ")" + ConsoleColor.Reset + "\n";
        }

        switch (baseFrame.getType()) {
            case FrameType.PADDING:
                var paddingFrame: PaddingFrame = <PaddingFrame>baseFrame;
                log += this.logPaddingFrame(paddingFrame, color);
                break;
            case FrameType.RESET_STREAM:
                var rstStreamFrame: RstStreamFrame = <RstStreamFrame>baseFrame;
                log += this.logRstStreamFrame(rstStreamFrame, color);
                break;
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame: ConnectionCloseFrame = <ConnectionCloseFrame>baseFrame;
                log += this.logConnectionCloseFrame(connectionCloseFrame, color);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame: ApplicationCloseFrame = <ApplicationCloseFrame>baseFrame;
                log += this.logApplicationCloseFrame(applicationCloseFrame, color);
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame: MaxDataFrame = <MaxDataFrame>baseFrame;
                log += this.logMaxDataFrame(maxDataFrame, color);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxStreamFrame: MaxStreamFrame = <MaxStreamFrame>baseFrame;
                log += this.logMaxStreamFrame(maxStreamFrame, color);
                break;
            case FrameType.MAX_STREAMS_BIDI:
            case FrameType.MAX_STREAMS_UNI:
                var maxStreamIdFrame: MaxStreamIdFrame = <MaxStreamIdFrame>baseFrame;
                log += this.logMaxStreamIdFrame(maxStreamIdFrame, color);
                break;
            case FrameType.PING:
                // nothing to log
                break;
            case FrameType.DATA_BLOCKED:
                var blockedFrame: BlockedFrame = <BlockedFrame>baseFrame;
                log += this.logBlockedFrame(blockedFrame, color);
                break;
            case FrameType.STREAM_DATA_BLOCKED:
                var streamBlockedFrame: StreamBlockedFrame = <StreamBlockedFrame>baseFrame;
                log += this.logStreamBlockedFrame(streamBlockedFrame, color);
                break;
            case FrameType.STREAMS_BLOCKED_BIDI:
            case FrameType.STREAMS_BLOCKED_UNI:
                var streamIdBlockedFrame: StreamIdBlockedFrame = <StreamIdBlockedFrame>baseFrame;
                log += this.logStreamIdBlockedFrame(streamIdBlockedFrame, color);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame: NewConnectionIdFrame = <NewConnectionIdFrame>baseFrame;
                log += this.logNewConnectionIdFrame(newConnectionIdFrame, color);
                break;
            case FrameType.STOP_SENDING:
                var stopSendingFrame: StopSendingFrame = <StopSendingFrame>baseFrame;
                log += this.logStopSendingFrame(stopSendingFrame, color);
                break;
            case FrameType.ACK:
                var ackFrame: AckFrame = <AckFrame>baseFrame;
                log += this.logAckFrame(connection, ackFrame, color);
                break;
            case FrameType.PATH_CHALLENGE:
                var pathChallengeFrame: PathChallengeFrame = <PathChallengeFrame>baseFrame;
                log += this.logPathChallengeFrame(pathChallengeFrame, color);
                break;
            case FrameType.PATH_RESPONSE:
                var pathResponseFrame: PathResponseFrame = <PathResponseFrame>baseFrame;
                log += this.logPathResponseFrame(pathResponseFrame, color);
                break;
            case FrameType.CRYPTO:
                let cryptoFrame: CryptoFrame = <CryptoFrame>baseFrame;
                log += this.logCryptoFrame(cryptoFrame, color);
                break;
        }
        if (baseFrame.getType() >= FrameType.STREAM && baseFrame.getType() <= FrameType.STREAM_MAX_NR) {
            var streamFrame: StreamFrame = <StreamFrame>baseFrame;
            log += this.logStreamFrame(streamFrame, color);
        }
        if( log == "" )
            VerboseLogging.error("packet.logging:logFrame : ERROR nothing logged for frame, shouldn't happen! " + baseFrame.getType() + " // " + baseFrame.toBuffer() );
            
        return log;
    }

    private logPaddingFrame(paddingFrame: PaddingFrame, color: ConsoleColor): string {
        return this.getSpaces(4) + "length= " + paddingFrame.getLength();
    }

    private logRstStreamFrame(rstStreamFrame: RstStreamFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + rstStreamFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Error code= " + rstStreamFrame.getApplicationErrorCode() + "\n";
        log += this.getSpaces(4) + "Final offset= " + rstStreamFrame.getFinalOffset().toDecimalString();
        return log;
    }

    private logConnectionCloseFrame(connectionCloseFrame: ConnectionCloseFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Error code= " + ConnectionErrorCodes[ connectionCloseFrame.getErrorCode() ] + "\n";
        log += this.getSpaces(4) + "Error phrase= " + connectionCloseFrame.getErrorPhrase();
        return log;
    }

    private logApplicationCloseFrame(applicationCloseFrame: ApplicationCloseFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Error code= " + applicationCloseFrame.getErrorCode() + "\n";
        log += this.getSpaces(4) + "Error phrase= " + applicationCloseFrame.getErrorPhrase();
        return log;
    }

    private logMaxDataFrame(maxDataFrame: MaxDataFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Max data=0x" + maxDataFrame.getMaxData().toString();
        return log;
    }

    private logMaxStreamFrame(maxStreamFrame: MaxStreamFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + maxStreamFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Max data=0x" + maxStreamFrame.getMaxData().toString();
        return log;
    }

    private logMaxStreamIdFrame(maxStreamIdFrame: MaxStreamIdFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Max streamID=0x" + maxStreamIdFrame.getMaxStreamId().toString();
        return log;
    }

    private logBlockedFrame(blockedFrame: BlockedFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "Blocked offset= " + blockedFrame.getBlockedOffset().toDecimalString();
        return log;
    }

    private logStreamBlockedFrame(streamBlockedFrame: StreamBlockedFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + streamBlockedFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Blocked offset= " + streamBlockedFrame.getBlockedOffset().toDecimalString();
        return log;
    }

    private logStreamIdBlockedFrame(streamIdBlockedFrame: StreamIdBlockedFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + streamIdBlockedFrame.getStreamId().toString();
        return log;
    }

    private logNewConnectionIdFrame(newConnectionIdFrame: NewConnectionIdFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "ConnectionID=0x" + newConnectionIdFrame.getConnectionId().toString() + "\n";
        log += this.getSpaces(4) + "Stateless Reset Token=0x" + newConnectionIdFrame.getStatelessResetToken().toString('hex');
        return log;
    }

    private logStopSendingFrame(stopSendingFrame: StopSendingFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "StreamID=0x" + stopSendingFrame.getStreamId().toString() + "\n";
        log += this.getSpaces(4) + "Application error code= " + stopSendingFrame.getApplicationErrorCode();
        return log;
    }

    private logAckFrame(connection: Connection, ackFrame: AckFrame, color: ConsoleColor): string {
        var log = "";
        var ackDelayExponent = connection.getLocalTransportParameter(TransportParameterId.ACK_DELAY_EXPONENT);
        var ackDelay = ackFrame.getAckDelay().toNumber() * (2 ** ackDelayExponent);

        log += this.getSpaces(4) + "largest acknowledged=" + ackFrame.getLargestAcknowledged().toDecimalString() + "\n";
        log += this.getSpaces(4) + "ack delay=" + ackDelay + " (microseconds)\n";
        log += this.getSpaces(4) + "ack block count=" + ackFrame.getAckBlockCount().toDecimalString() + "\n";
        log += this.getSpaces(4) + "first ackblock=" + ackFrame.getFirstAckBlock().toDecimalString();
        ackFrame.getAckBlocks().forEach((ackBlock: AckBlock) => {
            log += "\n";
            log += this.getSpaces(6) + "gap=" + ackBlock.getGap().toDecimalString() + ", ackblock=" + ackBlock.getBlock().toDecimalString();
        });

        if( ackFrame.containsECNinfo() ){
            log += "\n";
            log += this.getSpaces(4) + "ECT(0) count=" + ackFrame.getECT0count().toDecimalString() + "\n";
            log += this.getSpaces(4) + "ECT(1) count=" + ackFrame.getECT1count().toDecimalString() + "\n";
            log += this.getSpaces(4) + "CE count="     + ackFrame.getCEcount().toDecimalString() + "\n";
        }

        return log;
    }

    private logPathChallengeFrame(pathChallengeFrame: PathChallengeFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "data=0x" + pathChallengeFrame.getData().toString('hex');
        return log;
    }

    private logPathResponseFrame(pathResponseFrame: PathResponseFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + "data=0x" + pathResponseFrame.getData().toString('hex');
        return log;
    }

    private logCryptoFrame(cryptoFrame: CryptoFrame, color: ConsoleColor):string {
        var log = "";
        log += this.getSpaces(4) + "length=" + cryptoFrame.getLength().toDecimalString() + " offset=" + cryptoFrame.getOffset().toDecimalString() /*+ " data=0x" + cryptoFrame.getData().toString('hex')*/ + "\n";
        log += this.getSpaces(4) + "data=" + TLSMessageType[ cryptoFrame.getData()[0] ] + " (PROBABLY, but could be different or more if split or coalesced packet)";
        return log;
    }

    private logStreamFrame(streamFrame: StreamFrame, color: ConsoleColor): string {
        var log = "";
        log += this.getSpaces(4) + color + "STREAM (0x" + streamFrame.getType().toString(16) + ") " + ConsoleColor.Reset + " FIN=" + +streamFrame.getFin() + " LEN=" + +streamFrame.getLen() + " OFF=" + +streamFrame.getOff() + "\n";
        log += this.getSpaces(4) + "StreamID (0x" + streamFrame.getStreamID().toString() + ") length=" + streamFrame.getLength().toDecimalString() + " offset=" + streamFrame.getOffset().toDecimalString();
        log += "\n";
        log += this.logData(streamFrame.getData());
        return log;
    }

    public logData(buffer: Buffer): string {
        /* Example output:
            3c21646f63747970652068746d6c3e0a          '<!doctype html>\n'
            3c68746d6c3e0a202020203c68656164          '<html>\n    <head'
            3e0a20202020202020203c7469746c65          '>\n        <title'
            3e517569636b65723c2f7469746c653e          '>Quicker</title>'
            0a202020203c2f686561643e0a202020          '\n    </head>\n   '
            203c626f64793e0a2020202020202020          ' <body>\n        '
            3c703e48656c6c6f20576f726c642066          '<p>Hello World f'
            726f6d20517569636b6572213c2f703e          'rom Quicker!</p>'
            0a20202020202020203c62722f3e0a20          '\n        <br/>\n '
            202020202020203c703e476f6f646279          '       <p>Goodby'
            65213c2f703e0a202020203c2f626f64          'e!</p>\n    </bod'
            793e0a3c2f68746d6c3e                      'y>\n</html>'
        */
        var log = "";
        for (var i = 0; i < buffer.byteLength; i += 16) {
            if (i > 0)
                log += "\n";
            var size = (i + 16) < buffer.byteLength ? 16 : buffer.byteLength - i;
            var t = Buffer.alloc(size);
            buffer.copy(t, 0, i, i + size);
            var str = t.toString('hex');
            for (var j = 20; j >= 0; j--) {
                if (size === 0) {
                    str += "  ";
                } else {
                    size--;
                }
            }
            // inspect will nicely format the string for us (otherwhise the \n etc. would lead to newlines instead of showing up in the output)
            str += require('util').inspect(t.toString('utf8'), { showHidden: true, depth: null });
            log += this.getSpaces(6) + str;
        }
        return log;
    } 

    private getSpaces(amount: number): string {
        return Array(amount + 1).join(" ");
    }

    public logPacketStats( connectionId:string ){
        let log:string = "\n";

		//console.log(" Fetching RX " + connectionId + " from", Array.from( this.receivedPacketTypes.keys() ) );
		//console.log(" Fetching TX " + connectionId + " from", Array.from( this.sentPacketTypes.keys() ) );


		let tx = this.sentPacketTypes.get(connectionId) as Map<string,number>; 
		if( tx != undefined ){      
		    let txCount:number = 0;
		    for( let entry of tx.entries() )
		        txCount += entry[1];

		    log += "Total TX count: " + txCount + "\n";
		    log += [...tx].reduce((acc,v) => { return ((typeof acc == "string") ? acc + ", " : "\t") + v[0] + "=" + v[1];}, {} ) + "\n";
		}
		else
			log += "No packets sent on this connectionID, can only be for the initial setup!\n";


		let rx = this.receivedPacketTypes.get(connectionId) as Map<string,number>; 
		if( rx != undefined ){       

		    let rxCount:number = 0;
		    for( let entry of rx.entries() )
		        rxCount += entry[1];

		    log += "Total RX count: " + rxCount + "\n";
		    log += [...rx].reduce((acc,v) => { return ((typeof acc == "string") ? acc + ", " : "\t") + v[0] + "=" + v[1];}, {} ) + "\n";
        }
		else
			log += "No packets received on this connectionID, THIS IS AN ERROR, SHOULD NEVER HAPPEN!\n";

        this.startOutput.info(log);
    }
}

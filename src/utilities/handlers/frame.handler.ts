import {logMethod} from '../decorators/log.decorator';
import {Stream, StreamState, StreamEvent, StreamType} from '../../quicker/stream';
import {HandshakeValidation} from '../validation/handshake.validation';
import {Connection, ConnectionState, ConnectionEvent} from '../../quicker/connection';
import {BaseFrame, FrameType} from '../../frame/base.frame';
import {RstStreamFrame} from '../../frame/rst.stream';
import {ConnectionCloseFrame, ApplicationCloseFrame} from '../../frame/close';
import {MaxDataFrame} from '../../frame/max.data';
import {MaxStreamFrame} from '../../frame/max.stream';
import {MaxStreamIdFrame} from '../../frame/max.stream.id';
import {PingFrame} from '../../frame/ping';
import {BlockedFrame} from '../../frame/blocked';
import {StreamBlockedFrame} from '../../frame/stream.blocked';
import {StreamIdBlockedFrame} from '../../frame/stream.id.blocked';
import {NewConnectionIdFrame} from '../../frame/new.connection.id';
import {StopSendingFrame} from '../../frame/stop.sending';
import {AckFrame} from '../../frame/ack';
import {CryptoFrame} from '../../frame/crypto';
import {StreamFrame} from '../../frame/stream';
import {PacketFactory} from '../factories/packet.factory';
import {Bignum} from '../../types/bignum';
import {HandshakeState} from '../../crypto/qtls';
import {EncryptionLevel} from '../../crypto/crypto.context';
import {EndpointType} from '../../types/endpoint.type';
import {TransportParameters, TransportParameterId} from '../../crypto/transport.parameters';
import {BasePacket} from '../../packet/base.packet';
import { FrameFactory } from '../factories/frame.factory';
import { Constants } from '../constants';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { PacketLogging } from '../logging/packet.logging';
import { PathChallengeFrame, PathResponseFrame } from '../../frame/path';
import { VerboseLogging } from '../logging/verbose.logging'


export class FrameHandler {

    public constructor() {
        //
    }

    public handle(connection: Connection, frame: BaseFrame) {
        switch (frame.getType()) {
            case FrameType.PADDING:
                break;
            case FrameType.RESET_STREAM:
                var rstStreamFrame = <RstStreamFrame>frame;
                this.handleRstStreamFrame(connection, rstStreamFrame);
                break;
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame = <ConnectionCloseFrame>frame;
                this.handleConnectionCloseFrame(connection, connectionCloseFrame);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame = <ApplicationCloseFrame>frame;
                this.handleApplicationCloseFrame(connection, applicationCloseFrame);
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame = <MaxDataFrame>frame;
                this.handleMaxDataFrame(connection, maxDataFrame);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxDataStreamFrame = <MaxStreamFrame>frame;
                this.handleMaxStreamDataFrame(connection, maxDataStreamFrame);
                break;
            case FrameType.MAX_STREAMS_BIDI:
            case FrameType.MAX_STREAMS_UNI: // TODO: handle these two cases separately!
                var maxStreamIdFrame = <MaxStreamIdFrame>frame;
                this.handleMaxStreamIdFrame(connection, maxStreamIdFrame);
                break;
            case FrameType.PING:
                var pingFrame = <PingFrame>frame;
                this.handlePingFrame(connection, pingFrame);
                break;
            case FrameType.DATA_BLOCKED:
                var blockedFrame = <BlockedFrame>frame;
                this.handleBlockedFrame(connection, blockedFrame);
                break;
            case FrameType.STREAM_DATA_BLOCKED:
                var streamBlocked = <StreamBlockedFrame>frame;
                this.handleStreamBlockedFrame(connection, streamBlocked);
                break;
            case FrameType.STREAMS_BLOCKED_BIDI:
            case FrameType.STREAMS_BLOCKED_UNI: // TODO: handle these two cases separately!
                var streamIdBlocked = <StreamIdBlockedFrame>frame;
                this.handleStreamIdBlockedFrame(connection, streamIdBlocked);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame = <NewConnectionIdFrame>frame;
                this.handleNewConnectionIdFrame(connection, newConnectionIdFrame);
                break;
            case FrameType.STOP_SENDING:
                var stopSendingFrame = <StopSendingFrame>frame;
                this.handleStopSendingFrame(connection, stopSendingFrame);
                break;
            case FrameType.ACK:
                var ackFrame = <AckFrame>frame;
                this.handleAckFrame(connection, ackFrame);
                break;
            case FrameType.PATH_CHALLENGE:
                var pathChallengeFrame = <PathChallengeFrame>frame;
                this.handlePathChallengeFrame(connection, pathChallengeFrame);
                break;
            case FrameType.PATH_RESPONSE:
                var pathResponseFrame = <PathResponseFrame>frame;
                this.handlePathResponseFrame(connection, pathResponseFrame);
                break;
            case FrameType.CRYPTO:
                let cryptoFrame:CryptoFrame = <CryptoFrame>frame;
                this.handleCryptoFrame(connection, cryptoFrame);
                break;
        }
        if (frame.getType() >= FrameType.STREAM && frame.getType() <= FrameType.STREAM_MAX_NR) {
            var streamFrame = <StreamFrame>frame;
            this.handleStreamFrame(connection, streamFrame);
        }
    }

    private handleRstStreamFrame(connection: Connection, rstStreamFrame: RstStreamFrame) {
        var streamId = rstStreamFrame.getStreamId();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }
        var stream = connection.getStreamManager().getStream(rstStreamFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.RemoteClosed);
        } else if (stream.getStreamState() === StreamState.LocalClosed) {
            stream.setStreamState(StreamState.Closed);
        }
    }
    private handleConnectionCloseFrame(connection: Connection, connectionCloseFrame: ConnectionCloseFrame) {
        // incoming connectionclose means that the other endpoint is already in its closing state.
        // it is safe to set the state to draining then.
        let immediateShutdown:boolean = false;
        if( connectionCloseFrame.getErrorCode() === ConnectionErrorCodes.NO_ERROR ){
            connection.getQlogger().close();
            // TODO: remove this, only for automated debugging!
            if( connectionCloseFrame.getErrorPhrase() === "Everything is well in the world"){
                immediateShutdown = true;
                setTimeout( () => {
                    VerboseLogging.error("Exiting process with code 66");
                    console.log("Exiting process with code 66");
                    process.exit(66);
                }, 500);
            }
        }
        
        if( !immediateShutdown ){ 
            connection.setState(ConnectionState.Draining);
            connection.closeRequested();
        }
        //var frame: ConnectionCloseFrame = FrameFactory.createConnectionCloseFrame();
    }
    private handleApplicationCloseFrame(connection: Connection, applicationCloseFrame: ApplicationCloseFrame) {
        // incoming connectionclose means that the other endpoint is already in its closing state.
        // it is safe to set the state to draining then.
        connection.setState(ConnectionState.Draining);
        connection.closeRequested();
        //var frame: ConnectionCloseFrame = FrameFactory.createApplicationCloseFrame();
    }

    private handleMaxDataFrame(connection: Connection, maxDataFrame: MaxDataFrame) {
        if (connection.getSendAllowance().lessThan(maxDataFrame.getMaxData())) {
            connection.setSendAllowance(maxDataFrame.getMaxData());
        }
    }

    private handleMaxStreamDataFrame(connection: Connection, maxDataStreamFrame: MaxStreamFrame) {
        var streamId = maxDataStreamFrame.getStreamId();
        if (Stream.isReceiveOnly(connection.getEndpointType(), streamId)) {
            //throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
            return;
        }
        if (Stream.isSendOnly(connection.getEndpointType(), streamId) && !connection.getStreamManager().hasStream(streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }

        var stream = connection.getStreamManager().getStream(maxDataStreamFrame.getStreamId());
        if (stream.getSendAllowance().lessThan(maxDataStreamFrame.getMaxData())) {
            stream.setSendAllowance(maxDataStreamFrame.getMaxData());
            stream.setBlockedSent(false);
        }
    }

    private handleMaxStreamIdFrame(connection: Connection, maxStreamIdFrame: MaxStreamIdFrame) {
        if (maxStreamIdFrame.getMaxStreamId().and(new Bignum(0x2)).equals(new Bignum(2))) {
            connection.setRemoteMaxStreamUni(maxStreamIdFrame.getMaxStreamId());
        } else {
            connection.setRemoteMaxStreamBidi(maxStreamIdFrame.getMaxStreamId());
        }
    }

    private handlePingFrame(connection: Connection, pingFrame: PingFrame) {
        // Nothing to do here, ping is only used to keep a connection alive
    }

    private handleBlockedFrame(connection: Connection, blockedFrame: BlockedFrame) {
        connection.setPeerBlocked(true);
    }

    private handleStreamBlockedFrame(connection: Connection, streamBlocked: StreamBlockedFrame) {
        var streamId = streamBlocked.getStreamId();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }

        var streamId = streamBlocked.getStreamId()
        connection.getStreamManager().getStream(streamId).setPeerBlocked(true);
    }

    private handleStreamIdBlockedFrame(connection: Connection, streamIdBlockedFrame: StreamIdBlockedFrame) {
        if (streamIdBlockedFrame.getStreamId().and(new Bignum(0x2)).equals(new Bignum(2))) {
            connection.setLocalMaxStreamUniBlocked(true);
        } else {
            connection.setLocalMaxStreamBidiBlocked(true);
        }
    }

    private handleNewConnectionIdFrame(connection: Connection, newConnectionIdFrame: NewConnectionIdFrame) {
        VerboseLogging.error("FrameHandler:handleNewConnectionIdFrame : TODO: currently, we just ignore these!");
    }

    private handleStopSendingFrame(connection: Connection, stopSendingFrame: StopSendingFrame) {
        var streamId = stopSendingFrame.getStreamId();
        if (Stream.isReceiveOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION)
        }

        var stream = connection.getStreamManager().getStream(stopSendingFrame.getStreamId());
        if (stream.getStreamState() === StreamState.Open) {
            stream.setStreamState(StreamState.LocalClosed);
        } else if (stream.getStreamState() === StreamState.RemoteClosed) {
            stream.setStreamState(StreamState.Closed);
        } 
        stream.setFinalSentOffset(stream.getRemoteOffset());
        var rstStreamFrame = FrameFactory.createRstStreamFrame(stream.getStreamID(), 0, stream.getFinalSentOffset());
    }

    private handleAckFrame(connection: Connection, ackFrame: AckFrame) {
        //connection.getLossDetection().onAckReceived(ackFrame);

        let encryptionLevel:EncryptionLevel|undefined = ackFrame.getCryptoLevel();
        if( encryptionLevel === undefined )
            VerboseLogging.error("FrameHandler:handleAckFrame : frame had no encryptionLevel set, need this to properly deliver the data!");
        else
            connection.getEncryptionContext( encryptionLevel )!.getLossDetection().onAckReceived( ackFrame );
    
    }

    private handlePathChallengeFrame(connection: Connection, pathChallengeFrame: PathChallengeFrame) {
        var pathResponse = FrameFactory.createPathResponseFrame(pathChallengeFrame.getData());
        connection.queueFrame(pathResponse);
    }

    private handlePathResponseFrame(connection: Connection, pathResponseFrame: PathResponseFrame) {
        //TODO: check if we have send a path challenge frame; if true: check if data is same; else throw UNSOLICITED_PATH_RESPONSE
    }

    private handleCryptoFrame(connection: Connection, cryptoFrame: CryptoFrame){
        let encryptionLevel:EncryptionLevel|undefined = cryptoFrame.getCryptoLevel();
        if( encryptionLevel === undefined )
            VerboseLogging.error("FrameHandler:handleCryptoFrame : frame had no encryptionLevel set, need this to properly deliver the data!");
        else
            connection.getEncryptionContext( encryptionLevel )!.getCryptoStream().receiveData( cryptoFrame.getData(), cryptoFrame.getOffset() );
    }

    private handleStreamFrame(connection: Connection, streamFrame: StreamFrame): void {
        let streamId = streamFrame.getStreamID();
        if (Stream.isSendOnly(connection.getEndpointType(), streamId)) {
            throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Receiving data on send-only stream " + streamId.toDecimalString() );
        }

        let stream = connection.getStreamManager().getStream(streamId);
        stream.receiveData(streamFrame.getData(), streamFrame.getOffset(), streamFrame.getFin());
    }
}
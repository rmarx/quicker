import { Alarm, AlarmEvent } from '../types/alarm';
import { TransportParameterId } from '../crypto/transport.parameters';
import { AEAD } from '../crypto/aead';
import { QTLS, HandshakeState, QuicTLSEvents } from '../crypto/qtls';
import { ConnectionID, PacketNumber, Version } from '../packet/header/header.properties';
import { Bignum } from '../types/bignum';
import { RemoteInfo, Socket } from "dgram";
import { Stream, StreamType, StreamState } from './stream';
import { EndpointType } from '../types/endpoint.type';
import { Constants } from '../utilities/constants';
import { TransportParameters } from '../crypto/transport.parameters';
import { BasePacket, PacketType } from '../packet/base.packet';
import { BaseEncryptedPacket } from '../packet/base.encrypted.packet';
import { AckHandler } from '../utilities/handlers/ack.handler';
import { PacketLogging } from '../utilities/logging/packet.logging';
import { FlowControlledObject, FlowControlledObjectEvents } from '../flow-control/flow.controlled';
import { FlowControl } from '../flow-control/flow.control';
import { BaseFrame, FrameType } from '../frame/base.frame';
import { PacketFactory } from '../utilities/factories/packet.factory';
import { QuicStream } from './quic.stream';
import { FrameFactory } from '../utilities/factories/frame.factory';
import { HandshakeHandler, HandshakeHandlerEvents } from '../utilities/handlers/handshake.handler';
import { LossDetection, LossDetectionEvents } from '../loss-detection/loss.detection';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';
import { StreamFrame } from '../frame/stream';
import { MaxStreamIdFrame } from '../frame/max.stream.id';
import { MaxStreamFrame } from '../frame/max.stream';
import { MaxDataFrame } from '../frame/max.data';
import { CongestionControl, CongestionControlEvents } from '../congestion-control/congestion.control';
import { StreamManager, StreamManagerEvents, StreamFlowControlParameters } from './stream.manager';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { CryptoContext, EncryptionLevel, PacketNumberSpace, BufferedPacket } from '../crypto/crypto.context';
import { RTTMeasurement } from '../loss-detection/rtt.measurement';
import { QlogWrapper } from '../utilities/logging/qlog.wrapper';
import { BaseHeader, HeaderType } from '../packet/header/base.header';
import { LongHeaderType, LongHeader } from '../packet/header/long.header';

export class Connection extends FlowControlledObject {

    private remoteInfo: RemoteInformation;
    private socket: Socket;
    private endpointType: EndpointType;

    // we do not need an initialSrcConnectionID, because we only ever have one active
    // for the destination ID though, there are several instances where we need to store the updated value, but keep using the original one for a short time 
    // e.g., initial value is used for encrypting the packets during handshake, for version negotiation setup, etc. 
    private initialDestConnectionID!: ConnectionID;
    private srcConnectionID!: ConnectionID;
    private destConnectionID!: ConnectionID;

    //private localPacketNumber!: PacketNumber; // for sending
    //private remotePacketNumber!: PacketNumber; // for receiving: due to packet number encoding, we need to keep track of the last received nr to decode newly received ones, see PacketNumber.adjustNumber

    private localTransportParameters!: TransportParameters;
    private remoteTransportParameters!: TransportParameters;
    private version!: Version;
    private initialVersion!: Version;
    private state!: ConnectionState;
    private earlyData?: Buffer;
    private spinBit: boolean;

    private remoteMaxStreamUni!: Bignum;
    private remoteMaxStreamBidi!: Bignum;
    private localMaxStreamUni!: Bignum;
    private localMaxStreamBidi!: Bignum;
    private localMaxStreamUniBlocked: boolean;
    private localMaxStreamBidiBlocked: boolean;

    private idleTimeoutAlarm: Alarm;
    private transmissionAlarm: Alarm;
    private closePacket!: BaseEncryptedPacket;
    private closeSentCount: number;
    private retrySent: boolean;

    private qtls: QTLS;
    private aead: AEAD;

    private contextInitial!: CryptoContext;
    private context0RTT!: CryptoContext;
    private contextHandshake!: CryptoContext;
    private context1RTT!:CryptoContext;

    private congestionControl!: CongestionControl;
    private flowControl!: FlowControl;
    private streamManager!: StreamManager;
    private handshakeHandler!: HandshakeHandler;

    private qlogger!:QlogWrapper;

    public constructor(remoteInfo: RemoteInformation, endpointType: EndpointType, socket: Socket, initialDestConnectionID: ConnectionID, options?: any, bufferSize: number = Constants.DEFAULT_MAX_DATA) {
        super(bufferSize);
        this.remoteInfo = remoteInfo;
        this.socket = socket;
        this.endpointType = endpointType;
        this.idleTimeoutAlarm = new Alarm();
        this.transmissionAlarm = new Alarm();
        this.localMaxStreamUniBlocked = false;
        this.localMaxStreamBidiBlocked = false;
        this.closeSentCount = 0;
        this.spinBit = false;
        this.retrySent = false;

        this.initialDestConnectionID = initialDestConnectionID;

        if (this.endpointType === EndpointType.Client) {
            if (options && options.version)
                this.version = new Version(Buffer.from(options.version, "hex"));
            else
                this.version = new Version(Buffer.from(Constants.getActiveVersion(), "hex"));
        }
        
        // TODO: make this opt-in, as logging has overhead
        // make a dummy qlogger that has the same methods, but which just don't do anything
        this.qlogger = new QlogWrapper( this.initialDestConnectionID.toString(), this.endpointType, "Qlog from " + (new Date().toString()) );

        // Create QuicTLS Object
        this.qtls = new QTLS(endpointType === EndpointType.Server, options, this);
        this.aead = new AEAD(this.qtls); // TODO: refactor this a bit... everything is now way to dependent on initialization order

        this.initializeCryptoContexts();
        this.initializeHandlers(socket);

        // Hook QuicTLS Events
        this.hookQuicTLSEvents();
        // Initialize QuicTLS Object
        this.qtls.init();
        

        if (this.endpointType === EndpointType.Client) {
            /*
            // Check if remote transport parameters exists (only happens when session resumption is used) and contains a version which is still supported by the client
            if (this.remoteTransportParameters !== undefined && (Constants.SUPPORTED_VERSIONS.indexOf(this.remoteTransportParameters.getVersion().toString()) !== -1)) {
                this.version = this.remoteTransportParameters.getVersion();
            }
            */
            this.initialVersion = this.version;
        }


        this.qlogger.onPathUpdate( remoteInfo.family, this.socket.address().address, this.socket.address().port, remoteInfo.address, remoteInfo.port );
    }

    private initializeCryptoContexts(){

        let rttMeasurer = new RTTMeasurement(this);
        let lossInit = new LossDetection(rttMeasurer, this);
        lossInit.DEBUGname = "Initial";
        let lossHandshake = new LossDetection(rttMeasurer, this);
        lossHandshake.DEBUGname = "Handshake";
        let lossData = new LossDetection(rttMeasurer, this);
        lossData.DEBUGname = "0/1RTT";

        let pnsData      = new PacketNumberSpace(); // 0-RTT and 1-RTT have different encryption levels, but they share a PNS
        let ackData      = new AckHandler(this); // TODO: AckHandler should be coupled to PNSpace directly? make this more clear by adding it to that class instead maybe?
        this.contextInitial     = new CryptoContext( EncryptionLevel.INITIAL,   new PacketNumberSpace(), new AckHandler(this), lossInit );
        this.context0RTT        = new CryptoContext( EncryptionLevel.ZERO_RTT,  pnsData,                 ackData,              lossData );
        this.contextHandshake   = new CryptoContext( EncryptionLevel.HANDSHAKE, new PacketNumberSpace(), new AckHandler(this), lossHandshake );
        this.context1RTT        = new CryptoContext( EncryptionLevel.ONE_RTT,   pnsData,                 ackData,              lossData );

        ackData.DEBUGname = "0/1RTT";
        this.contextInitial.getAckHandler().DEBUGname = "Initial";
        this.contextHandshake.getAckHandler().DEBUGname = "Handshake";
    }

    private initializeHandlers(socket: Socket) {
        this.handshakeHandler = new HandshakeHandler(this.qtls, this.aead, this.endpointType === EndpointType.Server);
        this.streamManager = new StreamManager(this.endpointType);
        this.flowControl = new FlowControl(this);
        this.congestionControl = new CongestionControl(this, [this.contextInitial.getLossDetection(), this.contextHandshake.getLossDetection(), this.context1RTT.getLossDetection()] ); // 1RTT and 0RTT share loss detection, don't add twice!

        this.hookStreamManagerEvents();
        this.hookLossDetectionEvents();
        this.hookCongestionControlEvents();
        this.hookHandshakeHandlerEvents();

        this.handshakeHandler.registerCryptoStream( this.contextInitial.getCryptoStream() );
        this.handshakeHandler.registerCryptoStream( this.context0RTT.getCryptoStream() );
        this.handshakeHandler.registerCryptoStream( this.contextHandshake.getCryptoStream() );
        this.handshakeHandler.registerCryptoStream( this.context1RTT.getCryptoStream() );
    }

    private hookHandshakeHandlerEvents() {
        this.handshakeHandler.on(HandshakeHandlerEvents.ClientHandshakeDone, () => {
            this.emit(ConnectionEvent.HANDSHAKE_DONE);
        });

        this.handshakeHandler.on( HandshakeHandlerEvents.NewDecryptionKeyAvailable, (forLevel:EncryptionLevel) => {

            // here, we mainly deal with out-of-order packets from other encryption levels
            // they have potentially been buffered, waiting for decryption keys to become available
            // normally: decryption key available = ready to decrypt
            // HOWEVER: there is an edge case here.
            // When the handshake is done, we first get the decryption key available, and then a SEPARATE event that the handshake is done
            // NORMALLY this shouldn't give issues, but we want to be a bit future proof and very paranoid
            // so: in the case of 1-RTT keys, we only process any buffered stuff when the handshake is also actually done
            // Before, we didn't do this, which caused us to send STREAM frames in Handshake packets
            // since a buffered 1-RTT GET request was process immediately after the TLS CLIENT_FINISHED, but before HANDSHAKE_DONE
            // NOTE: current setup still leads to NewSessionTicket events (which come after handshake-done) to be processed and transmitted
            // after the packets we bubble up here... that's sub-ideal but should be fixed with additional logic that has congestion control/flow control
            // wait a bit instead of trying to TX everything immediately as it comes in
            // NOTE 2 : ngtcp2 doesn't have this issue, because they don't use SSLInfoCallback to see if handshake is done 
            // TODO: maybe we can use this logic as well? still doesn't solve our NewSessionTicket issue though 
            //  (ngtcp2 solves that by using libev, which sends when the socket is ready, not when we have put stuff in the buffers)

            if( forLevel == EncryptionLevel.ONE_RTT ){
                if( this.qtls.getHandshakeState() < HandshakeState.CLIENT_COMPLETED ){ // handshake not yet done

                    VerboseLogging.info("Connection:NewDecryptionKeyAvailable : 1RTT keys before handshake done: delaying buffered bubbling");

                    this.qtls.once( QuicTLSEvents.HANDSHAKE_DONE, () => {
                        VerboseLogging.info("Connection:NewDecryptionKeyAvailable : handshake done: bubbling up any buffered 1RTT packets");
                        this.processBufferedReceivedPackets( forLevel );
                    });

                    return;
                }
                // here, handshake is done, so free to bubble up packets
            }
            
            this.processBufferedReceivedPackets( forLevel );
        });
    }

    private hookCongestionControlEvents() {
        this.congestionControl.on(CongestionControlEvents.PACKET_SENT, (basePacket: BasePacket) => {
            this.qlogger.onPacketTX( basePacket );
            PacketLogging.getInstance().logOutgoingPacket(this, basePacket);

            // can't simply let loss detection listing to the PACKET_SENT event, 
            // because we need to marshall the event to the correct Packet Number Space loss detector
            // we COULD let loss detection check the proper PNS itself, but this feels cleaner, 
            // especially if we want to refactor all the events out of the internal codebase anyway
            let ctx = this.getEncryptionContextByPacketType( basePacket.getPacketType() );
            if( ctx ){ // TODO: should packets like VersionNegotation and RETRY etc. have influence on loss detection? probably not on retransmit, but maybe on latency estimates? 
                ctx.getLossDetection().onPacketSent( basePacket );
            }

            this.emit(ConnectionEvent.PACKET_SENT, basePacket);
        });
    }

    private hookLossDetectionEvents() {
        let contexts = [this.contextInitial, this.contextHandshake, this.context1RTT]; // 0/1RTT share a packet number space and loss detector/ack handler

        for( let context of contexts ){
            context.getLossDetection().on(LossDetectionEvents.RETRANSMIT_PACKET, (basePacket: BasePacket) => {
                this.retransmitPacket(basePacket);
            });
            context.getLossDetection().on(LossDetectionEvents.PACKET_ACKED, (basePacket: BasePacket) => {
                //let ctx = this.getEncryptionContextByPacketType( basePacket.getPacketType() );
                //ctx.getAckHandler().onPacketAcked(basePacket);
                
                context.getAckHandler().onPacketAcked(basePacket); 
            });
        }
    }

    private hookQuicTLSEvents() {
        this.qtls.on(QuicTLSEvents.LOCAL_TRANSPORTPARAM_AVAILABLE, (transportParams: TransportParameters) => {
            this.setLocalTransportParameters(transportParams);
        });
        this.qtls.on(QuicTLSEvents.REMOTE_TRANSPORTPARAM_AVAILABLE, (transportParams: TransportParameters) => {
            this.setRemoteTransportParameters(transportParams);
        });
    }

    private hookStreamManagerEvents() {
        this.streamManager.on(StreamManagerEvents.INITIALIZED_STREAM, (stream: Stream) => {
            // for external users of the quicker library
            if (stream.isRemoteStream()) {
                // Only emits the event if the stream was initiated by the peer
                this.emit(ConnectionEvent.STREAM, new QuicStream(this, stream));
            }
            else {
                // Only emits the event if the stream was initiated by the peer
                this.emit(ConnectionEvent.CREATED_STREAM, new QuicStream(this, stream));
            }
            
            // purely for internal usage 
            stream.on(FlowControlledObjectEvents.INCREMENT_BUFFER_DATA_USED, (dataLength: number) => {
                // connection has a maximum amount of data allowed for all streams combined + individual numbers for streams
                // whenever a stream changes its allowances, the total connection's allowances should change along 
                this.incrementBufferSizeUsed(dataLength); 
            });
            stream.on(FlowControlledObjectEvents.DECREMENT_BUFFER_DATA_USED, (dataLength: number) => {
                this.decrementBufferSizeUsed(dataLength);
            });
        });
    }

    public getInitialDestConnectionID(): ConnectionID {
        return this.initialDestConnectionID;
    }

    /*
    public setInitialDestConnectionID(connectionID: ConnectionID): void {
        this.initialDestConnectionID = connectionID;
    }
    */

    public setRetrySent(ret: boolean): void {
        this.retrySent = ret;
    }

    public getRetrySent(): boolean {
        return this.retrySent;
    }

    public getSrcConnectionID(): ConnectionID {
        return this.srcConnectionID;
    }

    public setSrcConnectionID(connectionID: ConnectionID) {
        this.srcConnectionID = connectionID;
    }

    public getDestConnectionID(): ConnectionID {
        return this.destConnectionID;
    }

    public setDestConnectionID(connectionID: ConnectionID) {
        this.destConnectionID = connectionID;
    }

    public getState(): ConnectionState {
        return this.state;
    }

    public setState(connectionState: ConnectionState) {
        this.state = connectionState;

        if( connectionState == ConnectionState.Closed ){
            this.qlogger.close();
        }
    }

    public getEndpointType(): EndpointType {
        return this.endpointType;
    }

    public getQuicTLS(): QTLS {
        return this.qtls;
    }

    public getAEAD(): AEAD {
        return this.aead;
    }

    public getALPN():string|undefined {
        return this.qtls.getNegotiatedALPN();
    }

    public getStreamManager(): StreamManager {
        return this.streamManager;
    }

    public getLocalTransportParameter(type: TransportParameterId): any {
        return this.localTransportParameters.getTransportParameter(type);
    }

    public setLocalTransportParameter(type: TransportParameterId, value: any): void {
        this.localTransportParameters.setTransportParameter(type, value);
    }

    public getLocalTransportParameters(): TransportParameters {
        return this.localTransportParameters;
    }

    public getRemoteMaxStreamUni(): Bignum {
        return this.remoteMaxStreamUni;
    }

    public getRemoteMaxStreamBidi(): Bignum {
        return this.remoteMaxStreamBidi;
    }

    setRemoteMaxStreamUni(remoteMaxStreamUni: number): void
    setRemoteMaxStreamUni(remoteMaxStreamUni: Bignum): void
    public setRemoteMaxStreamUni(remoteMaxStreamUni: any): void {
        if (remoteMaxStreamUni instanceof Bignum) {
            this.remoteMaxStreamUni = remoteMaxStreamUni;
            return;
        }
        this.remoteMaxStreamUni = new Bignum(remoteMaxStreamUni);
    }

    setRemoteMaxStreamBidi(remoteMaxStreamBidi: number): void
    setRemoteMaxStreamBidi(remoteMaxStreamBidi: Bignum): void
    public setRemoteMaxStreamBidi(remoteMaxStreamBidi: any): void {
        if (remoteMaxStreamBidi instanceof Bignum) {
            this.remoteMaxStreamBidi = remoteMaxStreamBidi;
            return;
        }
        this.remoteMaxStreamBidi = new Bignum(remoteMaxStreamBidi);
    }

    public getLocalMaxStreamUni(): Bignum {
        return this.localMaxStreamUni;
    }

    public getLocalMaxStreamBidi(): Bignum {
        return this.localMaxStreamBidi;
    }

    setLocalMaxStreamUni(localMaxStreamUni: number): void
    setLocalMaxStreamUni(localMaxStreamUni: Bignum): void
    public setLocalMaxStreamUni(localMaxStreamUni: any): void {
        if (localMaxStreamUni instanceof Bignum) {
            this.localMaxStreamUni = localMaxStreamUni;
            return;
        }
        this.localMaxStreamUni = new Bignum(localMaxStreamUni);
    }

    setLocalMaxStreamBidi(localMaxStreamBidi: number): void
    setLocalMaxStreamBidi(localMaxStreamBidi: Bignum): void
    public setLocalMaxStreamBidi(localMaxStreamBidi: any): void {
        if (localMaxStreamBidi instanceof Bignum) {
            this.localMaxStreamBidi = localMaxStreamBidi;
            return;
        }
        this.localMaxStreamBidi = new Bignum(localMaxStreamBidi);
    }

    public setLocalMaxStreamUniBlocked(blocked: boolean): void {
        this.localMaxStreamUniBlocked = blocked;
    }

    public setLocalMaxStreamBidiBlocked(blocked: boolean): void {
        this.localMaxStreamBidiBlocked = blocked;
    }

    public getLocalMaxStreamUniBlocked(): boolean {
        return this.localMaxStreamUniBlocked;
    }

    public getLocalMaxStreamBidiBlocked(): boolean {
        return this.localMaxStreamBidiBlocked;
    }

    public setLocalTransportParameters(transportParameters: TransportParameters): void {
        VerboseLogging.info("Connection:setLocalTransportParameters : " + transportParameters.toJSONstring(true) );
        this.getQlogger().onLocalTransportParametersChange( transportParameters );

        this.localTransportParameters = transportParameters;
        this.setReceiveAllowance(transportParameters.getTransportParameter(TransportParameterId.INITIAL_MAX_DATA));
        this.setLocalMaxStreamUni(transportParameters.getTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_UNI) * 4);
        this.setLocalMaxStreamBidi(transportParameters.getTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_BIDI) * 4);
        
        let streamManager:StreamManager = this.getStreamManager();
        let flowControl:StreamFlowControlParameters = streamManager.getFlowControlParameters();
        flowControl.receive_our_bidi   = transportParameters.getTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL );
        flowControl.receive_their_bidi = transportParameters.getTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE );
        flowControl.receive_their_uni  = transportParameters.getTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_UNI );

        streamManager.getStreams().forEach((stream: Stream) => {
            streamManager.applyDefaultFlowControlLimits( stream );
        });
    }

    public getRemoteTransportParameter(type: TransportParameterId): any {
        return this.remoteTransportParameters.getTransportParameter(type);
    }

    public setRemoteTransportParameter(type: TransportParameterId, value: any): void {
        this.remoteTransportParameters.setTransportParameter(type, value);
    }

    public getRemoteTransportParameters(): TransportParameters {
        return this.remoteTransportParameters;
    }

    public setRemoteTransportParameters(transportParameters: TransportParameters): void {
        VerboseLogging.info("Connection:setRemoteTransportParameters : " + transportParameters.toJSONstring(true) );
        this.getQlogger().onRemoteTransportParametersChange( transportParameters );
        
        this.remoteTransportParameters = transportParameters;
        this.setSendAllowance(transportParameters.getTransportParameter(TransportParameterId.INITIAL_MAX_DATA));
        this.setRemoteMaxStreamUni(transportParameters.getTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_UNI) * 4);
        this.setRemoteMaxStreamBidi(transportParameters.getTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_BIDI) * 4);
        
        let streamManager:StreamManager = this.getStreamManager();
        let flowControl:StreamFlowControlParameters = streamManager.getFlowControlParameters();
        flowControl.send_their_bidi = transportParameters.getTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL );
        flowControl.send_our_bidi   = transportParameters.getTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE );
        flowControl.send_our_uni    = transportParameters.getTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_UNI );

        streamManager.getStreams().forEach((stream: Stream) => {
            streamManager.applyDefaultFlowControlLimits( stream );
        });
    }

    public getVersion(): Version {
        return this.version;
    }

    public getInitialVersion(): Version {
        return this.initialVersion;
    }

    public setVersion(version: Version): void {
        this.version = version;
    }

    public setInitialVersion(initialVersion: Version): void {
        // Initial version for the client is already set in the constructor
        //  thus it cannot be changed anymore by the client
        // If the server changes the initial version, it can only be done ones
        //  initial version can be used to test if VN was already sent to the client
        if (this.initialVersion !== undefined) {
            return;
        }
        this.initialVersion = initialVersion;
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public getRemoteInformation(): RemoteInformation {
        return this.remoteInfo;
    }

    public getSpinBit(): boolean {
        return this.spinBit;
    }

    public setSpinBit(spinbit: boolean): void {
        this.spinBit = spinbit;
    }

    public getEncryptionContextByHeader(header:BaseHeader): CryptoContext | undefined {

        if (header.getHeaderType() === HeaderType.LongHeader) {
            let longHeader = header as LongHeader;

            if (longHeader.getPacketType() === LongHeaderType.Protected0RTT) 
                return this.getEncryptionContextByPacketType( PacketType.Protected0RTT );
            else if( longHeader.getPacketType() === LongHeaderType.Handshake )
                return this.getEncryptionContextByPacketType( PacketType.Handshake );
            else if( longHeader.getPacketType() === LongHeaderType.Initial ) 
                return this.getEncryptionContextByPacketType( PacketType.Initial );
            else if( longHeader.getPacketType() === LongHeaderType.Retry ){
                // retry packets are outside of normal packet functions and don't have encryption contexts or packet number spaces etc. 
                return undefined;
            }
        }
        else{
            return this.getEncryptionContextByPacketType( PacketType.Protected1RTT );
        }
    } 

    public getEncryptionContextByPacketType(packetType:PacketType): CryptoContext | undefined {
        if( packetType == PacketType.Initial )
            return this.contextInitial;
        else if( packetType == PacketType.Handshake )
            return this.contextHandshake;
        else if( packetType == PacketType.Protected0RTT )
            return this.context0RTT;
        else if( packetType == PacketType.Protected1RTT )
            return this.context1RTT;
        else if( packetType == PacketType.VersionNegotiation || packetType == PacketType.Retry ){
            // these packets are outside of normal packet functions and don't have encryption contexts or packet number spaces etc. 
            return undefined;
        }
        else{
            VerboseLogging.error("Connection:getEncryptionContextByPacketType : unsupported PacketType : " + PacketType[packetType] );
            return undefined;
        }
    } 

    public getEncryptionContext(level:EncryptionLevel): CryptoContext | undefined{
        if( level == EncryptionLevel.INITIAL )
            return this.contextInitial;
        else if( level == EncryptionLevel.HANDSHAKE )
            return this.contextHandshake;
        else if( level == EncryptionLevel.ZERO_RTT )
            return this.context0RTT;
        else if( level == EncryptionLevel.ONE_RTT )
            return this.context1RTT;
        else {
            VerboseLogging.error("Connection:getEncryptionContext : unsupported EncryptionLevel : " + EncryptionLevel[level] );
            return undefined;
        }
    }

    public getQlogger(){
        return this.qlogger;
    }

    public processBufferedReceivedPackets(forLevel:EncryptionLevel){
        let ctx = this.getEncryptionContext(forLevel);
        if( !ctx ){
            VerboseLogging.error("Connection:processBufferedReceivedPackets : unknown encryptionLevel " + EncryptionLevel[forLevel]);
            return;
        }

        let bufferedPackets:Array<BufferedPacket> = ctx.getAndClearBufferedPackets();
        VerboseLogging.info("Connection:processBufferedReceivedPackets : " + EncryptionLevel[forLevel] + ", bubbling " + bufferedPackets.length + " buffered packets");
        for( let packet of bufferedPackets ){
            this.emit( ConnectionEvent.BufferedPacketReadyForDecryption, packet );
        }
    }

    public resetConnection(negotiatedVersion?: Version) {
        this.resetConnectionState();
        this.getStreamManager().getStreams().forEach((stream: Stream) => {
            stream.reset();
        });
        if (negotiatedVersion !== undefined) {
            this.setVersion(negotiatedVersion);
        }
        this.startConnection();
    }

    public resetConnectionState() {
        // NOTE: we do not reset packet numbers, as this is explicitly forbidden by the QUIC transport spec 
        // FIXME: make sure the packet number spaces are not reset (especially Initial, since this method will mostly be used during Version Negotiation)
        VerboseLogging.error("Connection:resetConnectionState : TODO: implement Ack Handler resets, loss detection resets, currently does not do this!");

        this.contextInitial.getCryptoStream().resetOffsets();
        this.contextHandshake.getCryptoStream().resetOffsets();
        this.context0RTT.getCryptoStream().resetOffsets();
        this.context1RTT .getCryptoStream().resetOffsets(); 

        this.resetOffsets();
        this.getStreamManager().getStreams().forEach((stream: Stream) => {
            stream.resetOffsets();
        });
    }

    public queueFrame(baseFrame: BaseFrame) {
        this.queueFrames([baseFrame]);
    }

    public queueFrames(baseFrames: BaseFrame[]): void {
        baseFrames.forEach((baseFrame: BaseFrame) => {
            this.flowControl.queueFrame(baseFrame);
        });
        if (!this.transmissionAlarm.isRunning()) {
            this.startTransmissionAlarm();
        }
    }

    private retransmitPacket(packet: BasePacket) {
        VerboseLogging.info("Connection:retransmitPacket : " + PacketType[packet.getPacketType()] + " with nr " + packet.getHeader().getPacketNumber()!.getValue().toNumber() );

        if( this.connectionIsClosingOrClosed() ){
            VerboseLogging.info("Connection:retransmitPacket : we were in a closing state: no more retransmits for us. TODO: maybe we should retransmit in draining?");
            return;
        }

        let ctx:CryptoContext|undefined = this.getEncryptionContextByPacketType( packet.getPacketType() );
        if( ctx === undefined ){
            VerboseLogging.error("Connection:retransmitPacket : no CryptoContext known for this packet... doing nothing! " + PacketType[packet.getPacketType()]);
            return;
        }

        // For now, -very- quick and dirty retransmitting: just take the existing packet, swap out packet number for a new one, and go
        // FIXME: should be reworked into proper retransmits: old packets need to be divided into their components parts, then flow.control.ts needs to create new, decent packets
        // e.g., for many Control-level frames (e.g., Flow control stuff) we probably don't need to resend or want to send updated values 
        packet.DEBUG_wasRetransmitted = true;
        packet.DEBUG_originalPacketNumber = packet.getHeader().getPacketNumber()!;
        
        packet.getHeader().setPacketNumber( ctx.getPacketNumberSpace().getNext(), new PacketNumber(new Bignum(0)) );

        this.congestionControl.queuePackets([packet]);

        if(1 == 1) return;

        
        switch (packet.getPacketType()) {
            case PacketType.Initial:
                VerboseLogging.error("Connection:retransmitPacket : attempting to retransmit INITIAL packet, no logic defined for this yet, doing nothing");
                if( 1 == 1 ) return;
                break;
            case PacketType.Handshake:
                if (this.qtls.getHandshakeState() === HandshakeState.COMPLETED) {
                    // Only true for client after receiving the last stream 0 packet 
                    //      (with handshake data) in a protected short header packet
                    // Only true for server after receiving the last handshake packet of the client; 
                    //      after this packet everything needs to be send in shortheader packet
                    return;
                }
                break;
        }

        var framePacket = <BaseEncryptedPacket>packet;
        framePacket.getFrames().forEach((frame: BaseFrame) => {
            if (frame.isRetransmittable()) {
                VerboseLogging.info("Connection:retransmitPacket : retransmitting frame " + FrameType[frame.getType()] );
                //VerboseLogging.error("Connection:retransmitPacket : attempting to retransmit STREAM frame, no logic defined for this yet, doing nothing");
                //if( 1 == 1 ) return;
                this.retransmitFrame(frame);
            }
            else
                VerboseLogging.warn("Connection:retransmitPacket : attempting to retransmit frame but unable to " + FrameType[frame.getType()]);
        });
        // Send packets
        this.sendPackets();
    }

    private retransmitFrame(frame: BaseFrame) {
        switch (frame.getType()) {
            case FrameType.MAX_STREAMS_BIDI:
            case FrameType.MAX_STREAMS_UNI:
                var streamID = (<MaxStreamIdFrame>frame).getMaxStreamId();
                // Check if not a bigger maxStreamID frame has been sent
                if (Stream.isUniStreamId(streamID) && this.localMaxStreamUni.greaterThan(streamID)) {
                    return;
                }
                if (Stream.isBidiStreamId(streamID) && this.localMaxStreamBidi.greaterThan(streamID)) {
                    return;
                }
                break;
            case FrameType.MAX_STREAM_DATA:
                // Check if not a bigger MaxStreamData frame has been sent
                var maxStreamDataFrame = <MaxStreamFrame>frame;
                if (!this.getStreamManager().hasStream(maxStreamDataFrame.getStreamId())) {
                    return;
                }
                var stream = this.getStreamManager().getStream(maxStreamDataFrame.getStreamId());
                if (stream.getReceiveAllowance().greaterThan(maxStreamDataFrame.getMaxData())) {
                    return;
                }
                break;
            case FrameType.MAX_DATA:
                // Check if not a bigger MaxData frame has been sent
                var maxDataFrame = <MaxDataFrame>frame;
                if (this.getReceiveAllowance().greaterThan(maxDataFrame.getMaxData())) {
                    return;
                }
                break;
            case FrameType.STOP_SENDING:
                break;
            case FrameType.CRYPTO:
                VerboseLogging.error("Connection:RetransmitFrame : TODO : retransmit logic for CRYPTO frames!");
                if( 1 == 1)
                    return;
                break;
            default:
                if (frame.getType() >= FrameType.STREAM && frame.getType() <= FrameType.STREAM_MAX_NR) {
                    var streamFrame = <StreamFrame>frame;
                    // Check if stream exists and if RST_STREAM has been sent
                    // TODO: first check if RST_STREAM has been acked
                    // TODO: don't retransmit frame, retransmit data
                    if (!this.getStreamManager().hasStream(streamFrame.getStreamID())) {
                        return;
                    }
                    var stream = this.getStreamManager().getStream(streamFrame.getStreamID());
                    if (stream.getStreamState() === StreamState.LocalClosed || stream.getStreamState() === StreamState.Closed) {
                        return;
                    }
                    break;
                }
        }
        this.queueFrame(frame);
    }

    /**
     * Method to send a packet
     * @param basePacket packet to send
     */
    // REFACTOR TODO: create separate bufferPacket function so these logics don't get mixed 
    // Also probably fixes the sendPackets function below not performing the same checks as this one 
    public sendPacket(basePacket: BasePacket, bufferPacket: boolean = true): void {
        if (basePacket.getPacketType() !== PacketType.Retry && basePacket.getPacketType() !== PacketType.VersionNegotiation && basePacket.getPacketType() !== PacketType.Initial && bufferPacket) {
            var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>basePacket;
            this.queueFrames(baseEncryptedPacket.getFrames());
        } else {
            this.congestionControl.queuePackets([basePacket]);
        }
    }

    public sendPackets(): void {
        if (this.connectionIsClosingOrClosed()) {
            VerboseLogging.warn("Connection:sendPackets : trying to send data while connection closing");
            return;
        }


        this.transmissionAlarm.reset();
        var packets: BasePacket[] = this.flowControl.getPackets();
        VerboseLogging.info("Connection:sendPackets : queueing " + packets.length + " packets on congestionControl");
        this.congestionControl.queuePackets(packets);
    }

    private startTransmissionAlarm(): void {
        this.transmissionAlarm.on(AlarmEvent.TIMEOUT, () => {
            this.sendPackets();
        });
        this.transmissionAlarm.start(40);
    }

    public attemptEarlyData(earlyData?: Buffer): boolean {
        if (earlyData !== undefined) {
            this.earlyData = earlyData; 
        }
        if (this.earlyData !== undefined && this.getQuicTLS().isEarlyDataAllowed()) {
            var stream = this.getStreamManager().getNextStream(StreamType.ClientBidi);
            stream.addData(this.earlyData, true);
            this.sendPackets();
        }
        return false; // REFACTOR TODO: what good is a return value that's always the same? 
    }

    public startConnection(): void {
        if (this.endpointType === EndpointType.Server) {
            throw new QuicError(ConnectionErrorCodes.INTERNAL_ERROR, "We are server, we cannot start handshake");
        }
        // TEST TODO: handshakeHandler should be ready to go (i.e., have its properties properly set) or we should initialize it
        // REFACTOR TODO: Maybe just remove handshakeHandler completely and do it in here?
        // VERIFY TODO: I have no idea why we need to do this handshakeHandler here
        //  -> the real ClientInitial is built in sendPackets (which calls FlowControl, which actually builds it)
        //  -> startHandshake() does something weird with early data and tries to read the ClientInitial from the socket?!? (shouldn't that only be done on the server?)
        //  -> all in all, a bit unclear why this happens here 
        
        // REFACTOR TODO: do we take into account what happens if the ClientInitial is lost?
        // spec says: the client will send new packets until it successfully receives a response or it abandons the connection attempt. #6.2.1
        this.handshakeHandler.startHandshake(); 
        this.sendPackets();
        this.startIdleAlarm();
    }


    public getClosePacket(): BaseEncryptedPacket {
        return this.closePacket;
    }

    public setClosePacket(packet: BaseEncryptedPacket): void {
        this.closePacket = packet;
    }

    public closeRequested() {
        var alarm = new Alarm();
        alarm.start(Constants.TEMPORARY_DRAINING_TIME);
        alarm.on(AlarmEvent.TIMEOUT, () => {
            this.emit(ConnectionEvent.CLOSE);
        });
    }

    public checkConnectionState(): void {
        if (this.getState() === ConnectionState.Closing) {
            /**
             * Check to limit the amount of packets with closeframe inside
             */
            if (this.closeSentCount < Constants.MAXIMUM_CLOSE_FRAME_SEND) {
                this.closeSentCount++;
                var closePacket = this.getClosePacket();
                let highestReceivedNumber = this.context1RTT.getPacketNumberSpace().getHighestReceivedNumber();
                if( highestReceivedNumber === undefined )
                    highestReceivedNumber = new PacketNumber( new Bignum(0) );
                closePacket.getHeader().setPacketNumber(this.context1RTT.getPacketNumberSpace().getNext(), new PacketNumber(new Bignum(0)));
                this.qlogger.onPacketTX( closePacket );
                PacketLogging.getInstance().logOutgoingPacket(this, closePacket);
                this.getSocket().send(closePacket.toBuffer(this), this.getRemoteInformation().port, this.getRemoteInformation().address);
            }
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        else if (this.getState() === ConnectionState.Draining) {
            VerboseLogging.error("Connection:checkConnectionState : we were DRAINING, so ignoring incoming packet!");
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
        else if (this.getState() === ConnectionState.Closed) {
            VerboseLogging.error("Connection:checkConnectionState : we were CLOSED, so ignoring incoming packet!");
            throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
        }
    }

    public connectionIsClosingOrClosed(): boolean {
        if (this.getState() === ConnectionState.Closing) {
            return true;
        }
        if (this.getState() === ConnectionState.Draining) {
            return true;
        }
        if (this.getState() === ConnectionState.Closed) {
            return true;
        }
        return false;
    }

    public resetIdleAlarm(): void {
        this.idleTimeoutAlarm.reset();
    }

    public startIdleAlarm(): void {
        var time = this.localTransportParameters === undefined ? Constants.DEFAULT_IDLE_TIMEOUT : this.getLocalTransportParameter(TransportParameterId.IDLE_TIMEOUT);
        this.idleTimeoutAlarm.on(AlarmEvent.TIMEOUT, () => {
            this.state = ConnectionState.Draining;
            this.closeRequested();
            this.emit(ConnectionEvent.DRAINING);
        })
        this.idleTimeoutAlarm.start(time * 1000);
    }
}
export interface RemoteInformation {
    address: string;
    port: number,
    family: string
}

export enum ConnectionState {
    Handshake,
    Open,
    Closing,
    Draining,
    Closed
}

export enum ConnectionEvent {
    HANDSHAKE_DONE = "con-handshake-done",
    STREAM = "con-stream", // INCOMING new stream from the peer, not created by ourselves
    CREATED_STREAM = "con-created-stream", // OUTGOING new stream, created by ourselves
    DRAINING = "con-draining",
    CLOSE = "con-close",
    PACKET_SENT = "con-packet-sent",

    BufferedPacketReadyForDecryption = "buffered-packet-ready-for-decryption"
}

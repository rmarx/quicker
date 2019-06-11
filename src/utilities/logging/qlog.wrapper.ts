import { Logger, getLogger } from 'log4js';
import {Constants} from '../constants';
import { VerboseLogging } from './verbose.logging';

import * as qlog from '@quictools/qlog-schema';
import { QUtil } from '@quictools/qlog-schema/util';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { HeaderType, BaseHeader } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { ShortHeader } from '../../packet/header/short.header';
import { EndpointType } from '../../types/endpoint.type';
import { Bignum } from '../../types/bignum';
import { MaxStreamFrame } from '../../frame/max.stream';
import { MaxDataFrame } from '../../frame/max.data';
import { QuicStream } from '../../quicker/quic.stream';
import { StreamState } from '../../quicker/stream';
import { TransportParameters } from '../../crypto/transport.parameters';
import { Http3DataFrame, Http3HeaderFrame, Http3SettingsFrame, Http3PriorityFrame } from '../../http/http3/common/frames';
import { Http3Setting } from '../../http/http3/common/frames/http3.settingsframe';
import { Http3StreamState } from '../../http/http3/common/types/http3.streamstate';
import { Http3PrioritisedElementNode } from '../../http/http3/common/prioritization/http3.prioritisedelementnode';
import { Http3RequestNode } from '../../http/http3/common/prioritization/http3.requestnode';
import { Http3Header } from '../../http/http3/common/qpack/types/http3.header';
import { DependencyTree } from '../../http/http3/common/prioritization/http3.deptree';

/*
Example usage: 

let wrapper1:QlogWrapper = new QlogWrapper("ConnectionID_XYZ_11111", "CLIENT", "Testing qlog logging 1");
let wrapper2:QlogWrapper = new QlogWrapper("ConnectionID_XYZ_22222", "SERVER", "Testing qlog logging 2");

wrapper1.DEBUGtestLog("Entry 1");
wrapper1.DEBUGtestLog("Entry 2");
wrapper1.DEBUGtestLog("Entry 3");
wrapper1.DEBUGtestLog("Entry 4");
wrapper2.DEBUGtestLog("Separate file, shouldn't show up in file 1");

wrapper1.close();
wrapper2.close();
*/

// we have a single QlogWrapper instance per connection
export class QlogWrapper{

    private logger!:Logger;
    private startTime!:number;

    private currentSrcConnID:string = "";
    private currentDestConnID:string = "";
    private currentSpinbit?:number = undefined; 

    private wasClosed:boolean = false;

    public constructor(connectionID:string, endpointType:EndpointType, description:string ) {
        
        VerboseLogging.getInstance(); // make sure VerboseLogging is created, since it initializes log4js properly 

        // do not have the possibility of a NETWORK vantagepoint here, that's for things like wireshark/TCPDUMP
        let vantagePoint:qlog.VantagePoint = (endpointType === EndpointType.Client) ? qlog.VantagePoint.CLIENT : qlog.VantagePoint.SERVER;
        
        this.logger = getLogger("qlog");
        if (Constants.QLOG_FILE_NAME !== undefined) {
            this.logger.addContext("ID", Constants.QLOG_FILE_NAME);
        } else {
            this.logger.addContext("ID", connectionID + "_" + vantagePoint); // so we can split logs based on the connectionID, see VerboseLogging:ctor
        }
        this.logger.level = Constants.LOG_LEVEL;

        this.startTime = (new Date()).getTime();

        let qlogPreamble:any = {
            qlog_version: "0.1",
            description: description,
            // simple endpoint output file has only a single connection here 
            connections: [
                {
                    vantagepoint: vantagePoint,
                    connectionid: connectionID,
                    starttime: "" + this.startTime, // json has limited precision for numbers, so wrap timestamp as a string
                    metadata: "", // TODO: potentially also fill this one in here? 
                    fields: [
                        "time",
                        "category",
                        "type",
                        "trigger",
                        "data"
                    ],
                    events: [

                    ]
                }
            ]
        };

        // we can't just write the whole pre-amble, because we want to log the "Events" in the array
        // so we need to cut off the closing brackets at the end and write them again ourselves (see :close())
        let preambleString:string = JSON.stringify(qlogPreamble, null, 4); // pretty print with 4 spaces

        // we want to slide off ]}]}
        // so we search for 2nd to last ] and use that as slice point
        let events:number = preambleString.lastIndexOf("events");
        let squareBracketIndex:number = preambleString.indexOf("]", events);
        preambleString = preambleString.slice(0, squareBracketIndex);

        this.logger.error(preambleString);
    }

    public close(){
        // NOTE: log4js isn't really setup to write data when the log files are closing
        // this will lead to incomplete valid .json files (As we don't close the array of events properly)
        // calling this close() method alleviates that.
        // HOWEVER: we still need to take into account incomplete files, seeing as for a crash, this method will not be called
        // so the frontend needs to employ a streaming .json parser instead of a sync parser, which is best practice anyway
        // e.g., see http://oboejs.com 
        if( this.wasClosed )
            return;
            
        this.logger.error("]}]}");
        this.wasClosed = true;
    }

    // FIXME: make this of type qlog.IEventTuple instead of any (but also allow a more general setup that can bypass this if absolutely needed)
    private logToFile(evt:any[]){
        if( this.wasClosed ){
            VerboseLogging.warn("qlog was already closed, not appending!" + JSON.stringify(evt));
            return;
        }

        evt[0] = ((new Date()).getTime() - this.startTime); // we store the delta, which is small enough, shouldn't need a string
        this.logger.error( "                " + JSON.stringify(evt) + ",");
    }

    public onPathUpdate( ipVersion:string, localAddress:string, localPort:number, remoteAddress:string, remotePort:number ){

        let data = {
            ipVersion: (ipVersion.indexOf("4") >= 0) ? 4 : 6,
            local_address: localAddress,
            local_port: localPort,
            remote_address: remoteAddress,
            remote_port: remotePort
        }

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "PATH_UPDATE",
            "NEW_CONNECTION",
            data
        ];

        this.logToFile(evt);
    }

    public onPacketTX(packet:BasePacket, trigger:qlog.TransporEventTrigger = qlog.TransporEventTrigger.LINE){
        
        // TODO: this logic is probably best done somewhere else, but for now it's easiest to keep it isolated here until we know the best way to log this 
        let connIDs = this.extractConnectionIDs(packet.getHeader());
        if( connIDs.src && connIDs.src != this.currentSrcConnID ){
            this.onConnectionIDUpdate("SRC", this.currentSrcConnID, connIDs.src, "UNKNOWN");
            this.currentSrcConnID = connIDs.src;
        }
        if( connIDs.dest && connIDs.dest != this.currentDestConnID ){
            this.onConnectionIDUpdate("DEST", this.currentDestConnID, connIDs.dest, "UNKNOWN");
            this.currentDestConnID = connIDs.dest;
        }

        let spinbit = this.extractSpinbit(packet.getHeader());
        if( spinbit && spinbit != this.currentSpinbit ){
            this.onSpinbitToggle( this.currentSpinbit ? this.currentSpinbit : 0, spinbit );
            this.currentSpinbit = spinbit;
        }

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "PACKET_TX",//qlog.TransportEventType.TRANSPORT_PACKET_TX,
            trigger,
            this.packetToQlog( packet )
        ];

        this.logToFile(evt);
    }

    public onPacketRX(packet:BasePacket, trigger:qlog.TransporEventTrigger = qlog.TransporEventTrigger.LINE){
        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            qlog.TransportEventType.TRANSPORT_PACKET_RX,
            trigger,
            this.packetToQlog( packet )
        ];
        this.logToFile(evt);
        
        
        let spinbit = this.extractSpinbit(packet.getHeader());
        if( spinbit && spinbit != this.currentSpinbit ){
            this.onSpinbitToggle( this.currentSpinbit ? this.currentSpinbit : 0, spinbit );
            this.currentSpinbit = spinbit;
        }
    }

    // convenience function
    protected packetToQlog(packet:BasePacket):any {

        // TODO: add option to log full hexadecimal packet (allows replaying)
        // TODO: probably do this as a different event type maybe? easier to filter afterwards? 
        let data:any = {};

        let header = packet.getHeader();

        //data.header = (header.getHeaderType() === HeaderType.LongHeader) ? "long" : "short"; // packet type already implies header length as well
        data.type = PacketType[packet.getPacketType()];

        if( header.getHeaderType() !== HeaderType.LongHeader && header.getHeaderType() !== HeaderType.ShortHeader ){
            data.message = "TODO: support other header types " + HeaderType[header.getHeaderType()];
        }
        else{
            data.packet_number = packet.getHeader().getPacketNumber()!.getValue().toDecimalString();

            if( header.getHeaderType() === HeaderType.LongHeader ){
                data.version = (<LongHeader>header).getVersion().getValue().toString();
                data.payload_length = (<LongHeader>header).getPayloadLength().toDecimalString();
                //data.scid = (<LongHeader>header).getSrcConnectionID().toString();
                //data.dcid = (<LongHeader>header).getDestConnectionID().toString();
            }
            else{
                //data.spinbit = ((<ShortHeader>header).getSpinBit()) ? 1 : 0;
                //data.dcid = (<ShortHeader>header).getDestConnectionID().toString();
            }
        }

        return data;
    }

    protected extractConnectionIDs(header:BaseHeader):{src:string|undefined, dest:string|undefined}{
        let output:{src:string|undefined, dest:string|undefined} = {
            src: undefined,
            dest: undefined
        };

        if( header.getHeaderType() === HeaderType.LongHeader ){
            output.src = (<LongHeader>header).getSrcConnectionID().toString();
            output.dest = (<LongHeader>header).getDestConnectionID().toString();
        }
        else if( header.getHeaderType() !== HeaderType.ShortHeader ){
            output.dest = (<ShortHeader>header).getDestConnectionID().toString();
        }

        return output;
    }

    protected extractSpinbit(header:BaseHeader):number|undefined{
        if( header.getHeaderType() === HeaderType.ShortHeader )
            return ((<ShortHeader>header).getSpinBit()) ? 1 : 0;
        else
            return undefined;
    }

    public onConnectionIDUpdate(type:("SRC"|"DEST"), oldConnectionID:string, newConnectionID:string, trigger:string){

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "CONNECTION_ID_UPDATE",
            trigger,
            {
                type: type,
                old: oldConnectionID,
                new: newConnectionID
            }
        ];

        this.logToFile(evt);
    }

    public onSpinbitToggle(oldValue:number, newValue:number){

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "SPINBIT_TOGGLE",
            qlog.TransporEventTrigger.LINE,
            {
                old: oldValue,
                new: newValue
            }
        ];

        this.logToFile(evt);
    }

    // NOTE: stream states changes should have at least 2 entries, 1 for QUIC and 1 for H3, both with different metadata
    public onStreamStateChanged(streamID:Bignum, state:StreamState, trigger:string){

        // TODO: look at spec to get proper names for this 
        let stateString:string = "";
        switch(state){
            case StreamState.Open:
                stateString = qlog.TransportEventType.STREAM_NEW;
                break;
            case StreamState.Closed:
                stateString = "STREAM_CLOSED";
                break;
            case StreamState.LocalClosed:
                stateString = "STREAM_LOCAL_CLOSED";
                break;
            case StreamState.RemoteClosed:
                stateString = "STREAM_REMOTE_CLOSED";
                break;

        }

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "STREAM_STATE_UPDATE",
            trigger,
            {
                id: streamID.toDecimalString(),
                state: stateString
            }
        ];

        this.logToFile(evt);
    }

    public onLocalTransportParametersChange(tps:TransportParameters){

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "TRANSPORT_PARAMETERS_UPDATE",
            "DEFAULT",
            {
                type: "local",
                transport_parameters: tps.toJSONstring()
            }
        ];

        this.logToFile(evt);
    }

    public onRemoteTransportParametersChange(tps:TransportParameters){

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            "TRANSPORT_PARAMETERS_UPDATE",
            "DEFAULT",
            {
                type: "remote",
                transport_parameters: tps.toJSONstring()
            }
        ];

        this.logToFile(evt);
    }

    //----------------------------------------
    // Frame logs
    //----------------------------------------

    // TODO: decide on if we pass the old value here or not... 
    // if working purely event-based: preferably yes (though maybe we can track this state in qlog as well? no need to stay outside necessarily?)
    // if logging mainly the MAXSTREAMDATA frame: no 
    // this would indicate we need 2 separate events: one for FRAME_RX and one for actually upping the allowance...
    // let's keep it as a pure frame log for now and revisit later
    // probably :for frames that have simple side-effects this is enough. For more complex side-effects (e.g., ACK): add additional events
    // TODO: trigger doubles here as RX/TX determiner... is this ok? 
    onFrame_MaxStreamData(frame:MaxStreamFrame, trigger:("PACKET_RX"|"PACKET_TX")){

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            qlog.TransportEventType.MAXSTREAMDATA_NEW,
            trigger,
            {
                stream: frame.getStreamId().toDecimalString(),
                max_data: frame.getMaxData().toDecimalString()
            }
        ];

        this.logToFile(evt);
    }

    onFrame_MaxData(frame:MaxDataFrame, trigger:("PACKET_RX"|"PACKET_TX")){

        let evt:any = [
            123, 
            qlog.EventCategory.TRANSPORT,
            qlog.TransportEventType.MAXDATA_NEW,
            trigger,
            {
                max_data: frame.getMaxData().toDecimalString()
            }
        ];

        this.logToFile(evt);
    }

    //----------------------------------------
    // RECOVERY
    //----------------------------------------

    public onPacketLost(packetNumber:Bignum, trigger:qlog.RecoveryEventTrigger = qlog.RecoveryEventTrigger.ACK_RX){

        let evt:any = [
            123, 
            qlog.EventCategory.RECOVERY,
            "PACKET_LOST",
            trigger,
            {
                nr: packetNumber.toDecimalString()
            }
        ];

        this.logToFile(evt);
    }

    public onRTTUpdate(latestRTT:number, minRTT:number, smoothedRTT:number, variance:number, maxAckDelay:number, trigger:qlog.RecoveryEventTrigger = qlog.RecoveryEventTrigger.ACK_RX){

        let evt:any = [
            123, 
            qlog.EventCategory.RECOVERY,
            qlog.RecoveryEventType.RTT_UPDATE,
            trigger,
            {
                latest: latestRTT,
                min: minRTT,
                smoothed: smoothedRTT,
                variance: variance,
                max_ack_delay: maxAckDelay
            }
        ];

        this.logToFile(evt);
    }

    public onCWNDUpdate(ccPhase:string, currentCWND:number, oldCWND:number, trigger:qlog.RecoveryEventTrigger = qlog.RecoveryEventTrigger.ACK_RX){
        
        let evt:any = [
            123, 
            qlog.EventCategory.RECOVERY,
            qlog.RecoveryEventType.CWND_UPDATE,
            trigger,
            {
                phase: ccPhase,
                new: currentCWND,
                old: oldCWND
            }
        ];

        this.logToFile(evt);
    }

    // TODO: maybe currentCWND is not needed here? separate event? would just be included here to easily calculate available_cwnd value from bytes_in_flight
    public onBytesInFlightUpdate(bytesInFlight:number, currentCWND:number, trigger:string = "PACKET_TX"){

        let evt:any = [
            123, 
            qlog.EventCategory.RECOVERY,
            qlog.RecoveryEventType.BYTES_IN_FLIGHT_UPDATE,
            trigger,
            {
                bytes_in_flight: bytesInFlight
            }
        ];

        this.logToFile(evt);
    }

    public onLossDetectionArmed(alarmType:string, lastSentHandshakeTimestamp:Date, alarmDuration:number, trigger:string = "PACKET_TX"){

        let evt:any = [
            123, 
            qlog.EventCategory.RECOVERY,
            qlog.RecoveryEventType.LOSS_DETECTION_ARMED,
            trigger,
            {
                type: alarmType,
                last_handshake: lastSentHandshakeTimestamp.getMilliseconds(),
                duratoin: alarmDuration
            }
        ];

        this.logToFile(evt);
    }

    public onLossDetectionTriggered(alarmType:string, metadata:Object, trigger:string = "TIMEOUT"){
        
        let evt:any = [
            123, 
            qlog.EventCategory.RECOVERY,
            qlog.RecoveryEventType.LOSS_DETECTION_TRIGGERED,
            trigger,
            {
                type: alarmType,
                ...metadata // TODO: verify: this SHOULD copy all the fields from metadata into this object via the destructuring operator... not sure though
            }
        ];

        this.logToFile(evt);
    }

    //----------------------------------------
    // HTTP/3
    //----------------------------------------

    // e.g., onALPNSelected("h3-19", ["hq-18", "h3-19"])
    onALPNSelected(selectedOption:string, availableALPNOptions:string[]){

        let evt:any = [
            123, 
            "HTTP",
            "ALPN_UPDATE",
            "HANDSHAKE",
            {
                chosen: selectedOption,
                available: availableALPNOptions
            }
        ];

        this.logToFile(evt);
    }

    // e.g., onHTTPStreamStateChanged(stream.id, H3StreamState.OPENED, "GET")
    // e.g., onHTTPStreamStateChanged(stream.id, H3StreamState.OPENED, "CONTROL") 
    // e.g., onHTTPStreamStateChanged(stream.id, H3StreamState.OPENED, "QPACK_ENCODE")
    // e.g., onHTTPStreamStateChanged(stream.id, H3StreamState.MODIFIED, "HALF_CLOSED")
    // e.g., onHTTPStreamStateChanged(stream.id, H3StreamState.CLOSED, "FIN")
    // TODO Potentially add stream direction? ("UNI"|"BIDI")
    public onHTTPStreamStateChanged(streamID:Bignum, state:Http3StreamState, trigger:string){

        let evt:any = [
            123, 
            "HTTP",
            "STREAM_STATE_UPDATE",
            trigger,
            {
                id: streamID.toDecimalString(),
                state,
            }
        ];

        this.logToFile(evt);
    }

    public onHTTPFrame_Data(frame:Http3DataFrame, trigger:("TX"|"RX")){

        let evt:any = [
            123, 
            "HTTP",
            "DATA_FRAME_NEW",
            trigger,
            {
                payload_length: frame.getEncodedLength(),
            }
        ];

        this.logToFile(evt);
    }

    public onHTTPFrame_Headers(frame:Http3HeaderFrame, trigger:("TX"|"RX")){

        let evt:any = [
            123, 
            "HTTP",
            "HEADERS_FRAME_NEW",
            trigger,
            {
                payload_length: frame.getEncodedLength(),
                fields: [
                    ...frame.getHeaders(),
                ]
            }
        ];

        this.logToFile(evt);
    }

    // TODO: change frame to be the actual HTTP3 Settings Frame class!
    public onHTTPFrame_Settings(frame:Http3SettingsFrame, trigger:("TX"|"RX")){

        const settings: Http3Setting[] = frame.getSettings();
        const settingStrings: string[][] = settings.map((setting) => {
            return [setting.identifier.toString(), setting.value.toString()]
        });
        
        let evt:any = [
            123, 
            "HTTP",
            "SETTINGS_FRAME_NEW",
            trigger,
            {
                // TODO map identifiers to their respective string representations
                // max_header_list_size: frame.maxHeaderListSize,
                // num_placeholders: frame.numPlaceholders
                ...settingStrings,
            }
        ];

        this.logToFile(evt);
    }

    public onHTTPFrame_Priority(frame:Http3PriorityFrame, trigger:("TX"|"RX")) {
        const PEID: Bignum | undefined = frame.getPEID();
        const PEIDString: string | undefined = PEID === undefined ? undefined : PEID.toString();
        const EDID: Bignum | undefined = frame.getPEID();
        const EDIDString: string | undefined = EDID === undefined ? undefined : EDID.toString();

        let evt:any = [
            123,
            "HTTP",
            "PRIORITY_FRAME_NEW",
            trigger,
            {
                PET: frame.getPETString,
                PEID: PEIDString,
                EDT: frame.getEDTString,
                EDID: EDIDString,
                weight: frame.getWeight(),
            }
        ];

        this.logToFile(evt);
    }

    // FIXME This should probably be removed later, mostly here for debugging of prioritisation
    public onHTTPDataChunk(streamID:Bignum, byteLength:number, weight:number, trigger:("TX"|"RX")) {
        let evt:any = [
            123,
            "HTTP",
            "DATA_CHUNK",
            trigger,
            {
                stream_id: streamID.toDecimalString(),
                byte_length: byteLength,
                weight,
            }
        ]
        
        this.logToFile(evt);
    }
    
    // this is a more high-level log message that makes it easier to just follow HTTP level stuff without having to parse HEADERS
    // for a typical GET, you would log this first, then the HEADERS frame (as it was constructed)
    // TODO: is this something we really want to do? isn't this too high-level? 
    public onHTTPGet(uri:string, streamID: Bignum, trigger:("TX"|"RX")){

        let evt:any = [
            123,
            "HTTP",
            "GET",
            trigger,
            {
                uri: uri,
                stream_id: streamID.toDecimalString(),
            }
        ];

        this.logToFile(evt);
    }

    // Event is currently only triggered by structural changes, not by weight changes
    // TODO Maybe just log it everytime? -> If tool can provide easy to read div this should not cause any problems in terms of readability
    public onHTTPDependencyTreeChange(newTree: DependencyTree, trigger:("NEW"|"MOVED"|"REMOVED")) {
        const evt:any = [
            123,
            "HTTP",
            "PRIORITY_CHANGE",
            trigger,
            {
                new_tree: JSON.stringify(newTree),
            }
        ];

        this.logToFile(evt);
    }

    //----------------------------------------
    // QPACK
    //----------------------------------------

    public onQPACKEncoderInstruction(streamID:Bignum , instruction:Buffer, trigger:string){

        let evt:any = [
            123, 
            "QPACK",
            "ENCODER_INSTRUCTION_NEW",
            trigger,
            {
                stream_id: streamID.toDecimalString(),
                length: instruction.byteLength,
                raw: "0x" + instruction.toString("hex"),
                guessed_instruction: this.guessQPACKEncoderInstruction(instruction),
            }
        ];

        this.logToFile(evt);
    }

    public onQPACKDecoderInstruction(streamID:Bignum, instruction:Buffer, trigger:string){
        let evt:any = [
            123,
            "QPACK",
            "DECODER_INSTRUCTION_NEW",
            trigger,
            {
                stream_id: streamID.toDecimalString(),
                length: instruction.byteLength,
                raw: "0x" + instruction.toString("hex"),
                guessed_instruction: this.guessQPACKDecoderInstruction(instruction),
            }
        ];

        this.logToFile(evt);
    }

    public onQPACKEncode(encoded:Buffer, decoded: Http3Header[], trigger:string) {
        const decodedStrings: string[][] = decoded.map((val) => {
            return [val.name, val.value];
        });

        const evt:any = [
            123,
            "QPACK",
            "ENCODE_HEADER",
            trigger,
            {
                encoded: encoded.toString("hex"),
                decoded: decodedStrings,
            }
        ];

        this.logToFile(evt);
    }

    private guessQPACKEncoderInstruction(instruction:Buffer): string {
        if (instruction.byteLength === 0) {
            return "Can't guess for empty instruction";
        }
        const firstByte: number = instruction[0];
        switch (firstByte & (128 | 64 | 32)) {
            case 128:
                return "Dynamic table: Insert With Name Reference";
            case (128 | 64):
                return "Static table: Insert With Name Reference";
            case 64:
                return "Insert Without Name Reference";
            case 32:
                return "Set Dynamic Table Capacity";
            case 0:
                return "Duplicate";
            default:
                return "Could not guess instruction";
        }
    }

    private guessQPACKDecoderInstruction(instruction:Buffer): string {
        if (instruction.byteLength === 0) {
            return "Can't guess for empty instruction";
        }
        const firstByte: number = instruction[0];
        switch (firstByte & (128 | 64)) {
            case 128:
                return "Header acknowledment"
            case 64:
                return "Stream cancellation";
            case 0:
                return "Insert Count Increment";
            default:
                return "Could not guess instruction";
        }
    }
}

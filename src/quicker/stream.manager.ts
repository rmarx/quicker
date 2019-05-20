import { Stream, StreamType } from "./stream";
import { TransportParameters, TransportParameterId } from "../crypto/transport.parameters";
import { Bignum } from "../types/bignum";
import { EndpointType } from "../types/endpoint.type";
import { EventEmitter } from "events";
import { VerboseLogging } from "../utilities/logging/verbose.logging";

export class StreamFlowControlParameters {
    // Transport parameters control initial flow control settings per-stream type
    // There are 6 different parameters:
    // - OURS.max_data_bidi_local    : how much WE want to receive on a   BIDIRECTIONAL  stream WE   opened
    // - OURS.max_data_bidi_remote   : how much WE want to receive on a   BIDIRECTIONAL  stream THEY opened
    // - OURS.max_data_uni           : how much WE want to receive on a   UNIDIRECTIONAL stream THEY opened

    // - THEIRS.max_data_bidi_local  : how much THEY want to receive on a BIDIRECTIONAL  stream THEY opened
    // - THEIRS.max_data_bidi_remote : how much THEY want to receive on a BIDIRECTIONAL  stream WE   opened
    // - THEIRS.max_data_uni         : how much THEY want to receive on a UNIDIRECTIONAL stream WE   opened

    // willing to receive on ... :
    public receive_our_bidi!:   Bignum; // OURS.max_data_bidi_local
    public receive_their_bidi!: Bignum; // OURS.max_data_bidi_remote
    public receive_their_uni!:  Bignum; // OURS.max_data_uni

    // able to send on ...
    public send_their_bidi!:    Bignum; // THEIRS.max_data_bidi_local
    public send_our_bidi!:      Bignum; // THEIRS.max_data_bidi_remote
    public send_our_uni!:       Bignum; // THEIRS.max_data_uni

    public constructor(){
        // default settings for these values are 0 (draft-16)
        this.receive_our_bidi   = new Bignum(0);
        this.receive_their_bidi = new Bignum(0);
        this.receive_their_uni = new Bignum(0);

        this.send_our_bidi   = new Bignum(0);
        this.send_their_bidi = new Bignum(0);
        this.send_our_uni  = new Bignum(0);
    }
}

export class StreamManager extends EventEmitter {

    private streams: Stream[];
    private endpointType: EndpointType;

    public flowControl!: StreamFlowControlParameters;

    public constructor(endpointType: EndpointType) {
        super();
        this.endpointType = endpointType;
        this.streams = [];
        
        this.flowControl = new StreamFlowControlParameters();
    }
    
    public getStreams(): Stream[] {
        return this.streams;
    }

    // flow control parameter changes are applied automatically for NEW streams only
    // if you want to change existing streams, do that manually by calling applyDefaultFlowControlLimits()
    public getFlowControlParameters():StreamFlowControlParameters { return this.flowControl; } 


    public hasStream(streamId: number): boolean;
    public hasStream(streamId: Bignum): boolean;
    public hasStream(streamId: any): boolean {
        var stream = this._getStream(streamId);
        return stream !== undefined;
    }

    //public getStream(streamId: number): Stream;
    public getStream(streamId: Bignum): Stream;
    public getStream(streamId: any): Stream {
        var stream = this._getStream(streamId);
        if (stream === undefined) {
            stream = this.initializeStream( streamId );
        }
        return stream;
    }

    private initializeStream(streamId: Bignum): Stream {
        var stream = new Stream(this.endpointType, streamId);
        this.addStream(stream);

        VerboseLogging.info("StreamManager:initializeStream : starting stream " + streamId.toNumber() );

        this.applyDefaultFlowControlLimits(stream);

        this.emit(StreamManagerEvents.INITIALIZED_STREAM, stream);
        return stream;
    }

    // public because we might want to apply this manually on streams opened before we got remote transport parameters
    // NOTE: this will override any existing flow control imits currently on the stream! 
    public applyDefaultFlowControlLimits(stream: Stream){
        let streamId:Bignum = stream.getStreamID();
        let isLocal = Stream.isLocalStream(this.endpointType, streamId); // if we ourselves are opening the stream

        if( Stream.isBidiStreamId(streamId) ){
            if( isLocal ){ // bidi stream we are opening
                VerboseLogging.info("StreamManager:applyDefaultFlowControlLimits : local bidi stream " + streamId.toNumber() + " : RX max " + this.flowControl.receive_our_bidi + ", TX max " + this.flowControl.send_our_bidi );
                stream.setReceiveAllowance( this.flowControl.receive_our_bidi );
                stream.setSendAllowance( this.flowControl.send_our_bidi );
            }
            else{ // bidi stream the peer opened
                VerboseLogging.info("StreamManager:applyDefaultFlowControlLimits : remote bidi stream " + streamId.toNumber() + " : RX max " + this.flowControl.receive_their_bidi + ", TX max " + this.flowControl.send_their_bidi );
                stream.setReceiveAllowance( this.flowControl.receive_their_bidi );
                stream.setSendAllowance( this.flowControl.send_their_bidi );
            }
        }
        else{ // unidirectional
            if( isLocal ){ // uni stream we are opening
                VerboseLogging.info("StreamManager:applyDefaultFlowControlLimits : local uni stream " + streamId.toNumber() + " : RX max " + 0 + ", TX max " + this.flowControl.send_our_uni );
                stream.setReceiveAllowance( 0 ); // cannot receive anything on a uni-stream we ourselves open
                stream.setSendAllowance( this.flowControl.send_our_uni );
            }
            else{ // uni stream they are opening
                VerboseLogging.info("StreamManager:applyDefaultFlowControlLimits : remote uni stream " + streamId.toNumber() + " : RX max " + this.flowControl.receive_their_uni + ", TX max " + 0 );
                stream.setReceiveAllowance( this.flowControl.receive_their_uni );
                stream.setSendAllowance( 0 ); // cannot send anything on a uni-stream the peer opened
            }
        }
    }

    private _getStream(streamId: number): Stream | undefined;
    private _getStream(streamId: Bignum): Stream | undefined;
    private _getStream(streamId: any): Stream | undefined {
        var res = undefined;
        this.streams.forEach((stream: Stream) => {
            if (stream.getStreamID().equals(streamId)) {
                res = stream;
            }
        });
        return res;
    }

    public addStream(stream: Stream): void {
        if (this._getStream(stream.getStreamID()) === undefined) {
            this.streams.push(stream);
        }
    }

    public deleteStream(streamId: Bignum): void;
    public deleteStream(stream: Stream): void;
    public deleteStream(obj: any): void {
        var stream = undefined;
        if (obj instanceof Bignum) {
            stream = this._getStream(obj);
        } else {
            stream = obj;
        }
        if (stream === undefined) {
            return;
        }
        var index = this.streams.indexOf(stream);
        if (index > -1) {
            this.streams.splice(index, 1);
        }
    }

    public getNextStream(streamType: StreamType): Stream {
        var next = new Bignum(streamType);
        var stream = this._getStream(next);
        while (stream != undefined) {
            next = next.add(4);
            stream = this._getStream(next);
        }
        return this.getStream(next);
    }
}

export enum StreamManagerEvents {
    INITIALIZED_STREAM = "str-man-initialized-stream"
}
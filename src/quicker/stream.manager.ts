import { Stream, StreamType } from "./stream";
import { TransportParameters, TransportParameterType } from "../crypto/transport.parameters";
import { Bignum } from "../types/bignum";
import { EndpointType } from "../types/endpoint.type";
import { EventEmitter } from "events";


export class StreamManager extends EventEmitter{

    private streams: Stream[];
    private endpointType: EndpointType;

    public constructor(endpointType: EndpointType) {
        super();
        this.endpointType = endpointType;
        this.streams = [];
    }
    
    public getStreams(): Stream[] {
        return this.streams;
    }

    public hasStream(streamId: number): boolean;
    public hasStream(streamId: Bignum): boolean;
    public hasStream(streamId: any): boolean {
        var stream = this._getStream(streamId);
        return stream !== undefined;
    }

    public getStream(streamId: number): Stream;
    public getStream(streamId: Bignum): Stream;
    public getStream(streamId: any): Stream {
        var stream = this._getStream(streamId);
        if (stream === undefined) {
            stream = this.initializeStream(streamId);
        }
        return stream;
    }

    private initializeStream(streamId: Bignum, localTransportParameters?: TransportParameters, remoteTransportParameters?: TransportParameters): Stream {
        var stream = new Stream(this.endpointType, streamId);
        this.addStream(stream);
        if (localTransportParameters !== undefined) {
            stream.setLocalMaxData(localTransportParameters.getTransportParameter(TransportParameterType.MAX_STREAM_DATA));
        }
        if (remoteTransportParameters !== undefined) {
            stream.setRemoteMaxData(remoteTransportParameters.getTransportParameter(TransportParameterType.MAX_STREAM_DATA));
        }
        this.emit(StreamManagerEvents.INITIALIZED_STREAM, stream);
        return stream;
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
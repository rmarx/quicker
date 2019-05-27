import {Connection} from './connection';
import { EventEmitter } from "events";
import { Bignum } from "../types/bignum";
import { Stream, StreamEvent, StreamType } from "./stream";
import { FrameFactory } from '../utilities/factories/frame.factory';
import { QuickerEvent } from './quicker.event';

export class QuicStream extends EventEmitter{
    
    private encoding?: string;
    private stream: Stream;
    private connection: Connection;

    public constructor(connection: Connection, stream: Stream) {
        super();
        this.stream = stream;
        this.connection = connection;
        this.setupEvents(stream);
    }

    private setupEvents(stream: Stream): void {
        stream.on(StreamEvent.DATA, (data: Buffer) => {
            if (this.encoding !== undefined) {
                this.emit(QuickerEvent.STREAM_DATA_AVAILABLE, data.toString(this.encoding))
            } else {
                this.emit(QuickerEvent.STREAM_DATA_AVAILABLE, data);
            }
        });
        stream.on(StreamEvent.END, () => {
            this.emit(QuickerEvent.STREAM_END);
        });
    }
    
    public getStreamId():Bignum {
        return this.stream.getStreamID();
    }

    public write(data: Buffer): void {
        this.stream.addData(data);
    }

    public end(data?: Buffer): void {
        if (data !== undefined) {
            this.stream.addData(data, true);
        } else {
            this.stream.setFinalSentOffset(this.stream.getRemoteOffset());
        }
    }

    // TODO: refactor this. Is needed now so we can access the connection from a stream handler (see main.ts) but that's dirty
    // normally, even the stream shouldn't even know which connection it belongs to? 
    // TODO: see how Node's HTTP/2 stack handles this (i.e., having 1 event handler for stream handling)
    public getConnection():Connection {
        return this.connection;
    }

    public setEncoding(encoding: string): void {
        this.encoding = encoding;
    }
    
    public isBidiStream(): boolean {
        return this.stream.isBidiStream();
    }
    
    public isUniStream(): boolean {
        return this.stream.isUniStream();
    }
}


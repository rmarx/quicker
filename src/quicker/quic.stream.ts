import {Connection} from '../types/connection';
import { EventEmitter } from "events";
import { Bignum } from "../types/bignum";
import { Stream } from "../types/stream";
import { FrameFactory } from '../frame/frame.factory';

export class QuicStream extends EventEmitter{
    
    private encoding?: string;
    private stream: Stream;
    private connection: Connection;
    private bufferedData: Buffer;

    public constructor(connection: Connection, stream: Stream) {
        super();
        this.stream = stream;
        this.bufferedData = Buffer.alloc(0);
        this.connection = connection;
        this.setupEvents(stream);
    }

    private setupEvents(stream: Stream): void {
        stream.on('stream-data', (data: Buffer) => {
            if (this.encoding !== undefined) {
                this.emit('data', data.toString(this.encoding))
            } else {
                this.emit('data', data);
            }
        });
        stream.on('stream-end', () => {
            this.emit('end');
        });
    }

    public write(data: Buffer): void {
        this.bufferedData = Buffer.concat([this.bufferedData, data]);
    }

    public end(data?: Buffer): void {
        if (data !== undefined) {
            this.write(data);
        }
        var streamFrame = FrameFactory.createStreamFrame(this.stream, this.bufferedData, true, true);
        this.connection.sendFrame(streamFrame);
    }

    public setEncoding(encoding: string): void {
        this.encoding = encoding;
    }
}
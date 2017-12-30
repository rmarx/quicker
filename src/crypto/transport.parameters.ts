import {Connection} from '../types/connection';
import { EndpointType } from '../types/endpoint.type';


export class TransportParameters {

    private isServer: boolean;

    private maxStreamData: number;
    private maxData: number;
    private maxStreamIdBidi: number
    private maxStreamIdUni: number;
    private idleTimeout: number;
    private omitConnectionId: boolean;
    private maxPacketSize: number;
    private statelessResetToken: Buffer;
    private ackDelayExponent: number;

    public constructor(isServer: boolean, maxStreamData: number, maxData: number, idleTimeout: number) {
        this.isServer = isServer;
        this.maxStreamData = maxStreamData;
        this.maxData = maxData;
        this.idleTimeout = idleTimeout;
    }
    
    public setTransportParameter(type: TransportParameterType, value: any): void {
        switch(type) {
            case TransportParameterType.MAX_STREAM_DATA:
                this.maxStreamData = value;
                break;
            case TransportParameterType.MAX_DATA:
                this.maxData = value;
                break;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                this.statelessResetToken = value;
                break;
            case TransportParameterType.IDLE_TIMEOUT:
                this.idleTimeout = value;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI:
                this.maxStreamIdBidi = value;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_UNI:
                this.maxStreamIdUni = value;
                break;
            case TransportParameterType.MAX_PACKET_SIZE:
                this.maxPacketSize = value;
                break;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                this.ackDelayExponent = value;
                break;
            case TransportParameterType.OMIT_CONNECTION_ID:
                this.omitConnectionId = value;
                break;
        }
    }

    public getTransportParameter(type: TransportParameterType): any {
        switch(type) {
            case TransportParameterType.MAX_STREAM_DATA:
                return this.maxStreamData;
            case TransportParameterType.MAX_DATA:
                return this.maxData;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                return this.statelessResetToken;
            case TransportParameterType.IDLE_TIMEOUT:
                return this.idleTimeout;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI:
                return this.maxStreamIdBidi;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_UNI:
                return this.maxStreamIdUni;
            case TransportParameterType.MAX_PACKET_SIZE:
                return this.maxPacketSize;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                return this.ackDelayExponent;
            case TransportParameterType.OMIT_CONNECTION_ID:
                return this.omitConnectionId;
        }
        return undefined;
    }
        
    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(this.getBufferSize());
        var offset = 0;
        var bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_STREAM_DATA, buffer, offset);
        bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_DATA, bufferOffset.buffer, bufferOffset.offset);
        bufferOffset = this.writeTransportParameter(TransportParameterType.IDLE_TIMEOUT, bufferOffset.buffer, bufferOffset.offset);
        if (this.isServer) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, bufferOffset.buffer, bufferOffset.offset);
        }
        if (this.maxStreamIdBidi !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI,bufferOffset.buffer, bufferOffset.offset);
        }
        if (this.maxStreamIdUni !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_ID_UNI, bufferOffset.buffer, bufferOffset.offset);
        }
        if (this.maxPacketSize !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_PACKET_SIZE,bufferOffset.buffer, bufferOffset.offset);
        }
        if (this.ackDelayExponent !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT, bufferOffset.buffer, bufferOffset.offset);
        }
        if (this.omitConnectionId !== undefined && this.omitConnectionId) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.OMIT_CONNECTION_ID, bufferOffset.buffer, bufferOffset.offset);
        }
        return bufferOffset.buffer;
    }

    private writeTypeAndLength(type: TransportParameterType, buffer: Buffer, offset: number, length: number): BufferOffset {
        buffer.writeUInt16BE(type, offset);
        offset += 2;
        buffer.writeUInt16BE(length, offset);
        offset += 2;
        return {
            buffer: buffer, 
            offset: offset
        }
    }

    private writeTransportParameter(type: TransportParameterType, buffer: Buffer, offset: number): BufferOffset {
        var bufferOffset: BufferOffset = {buffer: buffer, offset: offset};
        switch(type) {
            case TransportParameterType.MAX_STREAM_DATA:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 4);
                bufferOffset.buffer.writeUInt32BE(this.maxStreamData, offset);
                bufferOffset.offset += 4;
                break;
            case TransportParameterType.MAX_DATA:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 4);
                bufferOffset.buffer.writeUInt32BE(this.maxData, offset);
                bufferOffset.offset += 4;
                break;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 16);
                this.statelessResetToken.copy(bufferOffset.buffer, bufferOffset.offset);
                bufferOffset.offset += 16;
                break;
            case TransportParameterType.IDLE_TIMEOUT:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 2);
                bufferOffset.buffer.writeUInt16BE(this.idleTimeout, offset);
                bufferOffset.offset += 2;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 4);
                bufferOffset.buffer.writeUInt32BE(this.maxStreamIdBidi, offset);
                bufferOffset.offset += 4;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_UNI:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 4);
                bufferOffset.buffer.writeUInt32BE(this.maxStreamIdUni, offset);
                bufferOffset.offset += 4;
                break;
            case TransportParameterType.MAX_PACKET_SIZE:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 2);
                bufferOffset.buffer.writeUInt16BE(this.maxPacketSize, offset);
                bufferOffset.offset += 2;
                break;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 1);
                bufferOffset.buffer.writeUInt8(this.ackDelayExponent, offset);
                bufferOffset.offset += 1;
                break;
            case TransportParameterType.OMIT_CONNECTION_ID:
                bufferOffset = this.writeTypeAndLength(type, buffer, offset, 0);
                break;
        }
        return bufferOffset;
    }

    private getBufferSize(): number {
        var size = 0;
        // max stream data: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + 4;
        // max data: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + 4;
        // idle timeout: 2 byte for type, 2 byte for length and 2 byte for value
        size += 2 + 2 + 2;
        if (this.maxStreamIdBidi !== undefined) {
            // max stream id for bidirectional streams: 2 byte for type,2 byte for length and 4 byte for value
            size += 2 + 2 + 4;
        }
        if (this.maxStreamIdUni !== undefined) {
            // max stream id for unidirectional streams: 2 byte for type,2 byte for length and 4 byte for value
            size += 2 + 2 + 4;
        }
        if (this.omitConnectionId !== undefined && this.omitConnectionId) {
            // omit connection id: only 2 byte for type and 2 byte for length
            size += 2 + 2;
        }
        if (this.maxPacketSize !== undefined) {
            // max size for a packet: 2 byte for type, 2 byte for length and 2 byte for value
            size += 2 + 2 + 2;
        }
        if (this.ackDelayExponent !== undefined) {
            // ack delay exponent: 2 byte for type, 2 byte for length and 1 for the exponent
            size += 2 + 2 + 1;
        }
        if (this.isServer) {
            // stateless reset token: 2 byte for type, 2 byte for length and 16 byte for value
            size += 2 + 2 + 16;
        }
        return size;
    }

    public static fromBuffer(connection: Connection, buffer: Buffer): TransportParameters {
        var values: { [index: number]: any; } = [];
        var offset = 0;
        var transportParameters = new TransportParameters(connection.getEndpointType() === EndpointType.Server, -1, -1, -1);
        while (offset < buffer.byteLength) {
            console.log("offset: " + offset);
            console.log("buffer length: " + buffer.byteLength);
            var type = buffer.readUInt16BE(offset);
            offset += 2;
            var len = buffer.readUInt16BE(offset);
            offset += 2;
            var value = undefined;
            if (len > 4) {
                value = Buffer.alloc(len);
                buffer.copy(value, 0, offset, offset + len);
            } else {
                value = buffer.readUIntBE(offset, len);
            }
            offset += len;
            if (type in values) {
                throw Error("TRANSPORT_PARAMETER_ERROR");
            }
            values[type] = value;
        }
        for (let key in values) {
            // Ignore unknown transport parameters
            if (key in TransportParameterType) {
                transportParameters.setTransportParameter(Number(key), values[key]);
            }
        }
        return transportParameters;
    }
}

export enum TransportParameterType {
    MAX_STREAM_DATA = 0x00,
    MAX_DATA = 0x01,
    INITIAL_MAX_STREAM_ID_BIDI = 0x02,
    IDLE_TIMEOUT = 0x03,
    OMIT_CONNECTION_ID = 0x04,
    MAX_PACKET_SIZE = 0x05,
    STATELESS_RESET_TOKEN = 0x06,
    ACK_DELAY_EXPONENT = 0x07,
    INITIAL_MAX_STREAM_ID_UNI = 0x08
}

export interface BufferOffset {
    buffer: Buffer,
    offset: number
}
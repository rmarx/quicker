import { QuicTLS } from "qtls_wrap";

/**
 * QuicTLS Wrapper
 */
export class QTLS {
    private qtlsHelper: QuicTLS;
    private isServer: boolean;
    private options: any;
    private transportParameters: TransportParameters;

    private cipher: string;

    public constructor(isServer: boolean, options: any) {
        this.isServer = isServer;
        this.options = options;
    }

    public setTransportParameters(buffer: Buffer, createNewHelper: boolean = true) {
        if(this.qtlsHelper === undefined || createNewHelper) {
            this.qtlsHelper = new QuicTLS(this.isServer, this.options);
        }
    }

    public getClientInitial(): Buffer {
        return this.qtlsHelper.getClientInitial();
    }

    public readHandshake(): Buffer {
        return this.qtlsHelper.readHandshakeData();
    }

    public writeHandshake(buffer: Buffer) {
        this.qtlsHelper.writeHandshakeData(buffer);
    }

    public getCipher() {
        return this.cipher;
    }

    public setCipher(cipher: string) {
        this.cipher = cipher;
    }
}

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
        
    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(this.getBufferSize());
        var offset = 0;
        var bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_STREAM_DATA, buffer, offset);
        bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_DATA, bufferOffset.buffer, bufferOffset.offset);
        bufferOffset = this.writeTransportParameter(TransportParameterType.IDLE_TIMEOUT, bufferOffset.buffer, bufferOffset.offset);
        if (this.isServer) {
            this.writeTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, bufferOffset.buffer, bufferOffset.offset);
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

    private writeTransportParameter(type: TransportParameterType, buffer: Buffer, offset: number): BufferOffset {
        switch(type) {
            case TransportParameterType.MAX_STREAM_DATA:
                buffer.writeUInt16BE(TransportParameterType.MAX_STREAM_DATA, offset);
                offset += 2;
                buffer.writeUInt32BE(this.maxStreamData, offset);
                offset += 4;
                break;
            case TransportParameterType.MAX_DATA:
                buffer.writeUInt16BE(TransportParameterType.MAX_DATA, offset);
                offset += 2;
                buffer.writeUInt32BE(this.maxData, offset);
                offset += 4;
                break;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                buffer.writeUInt16BE(TransportParameterType.STATELESS_RESET_TOKEN, offset);
                offset += 2;
                this.statelessResetToken.copy(buffer, offset);
                offset += 16;
                break;
            case TransportParameterType.IDLE_TIMEOUT:
                buffer.writeUInt16BE(TransportParameterType.IDLE_TIMEOUT, offset);
                offset += 2;
                buffer.writeUInt16BE(this.idleTimeout, offset);
                offset += 2;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI:
                buffer.writeUInt16BE(TransportParameterType.INITIAL_MAX_STREAM_ID_BIDI, offset);
                offset += 2;
                buffer.writeUInt32BE(this.maxStreamIdBidi, offset);
                offset += 4;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_ID_UNI:
                buffer.writeUInt16BE(TransportParameterType.INITIAL_MAX_STREAM_ID_UNI, offset);
                offset += 2;
                buffer.writeUInt32BE(this.maxStreamIdUni, offset);
                offset += 4;
                break;
            case TransportParameterType.MAX_PACKET_SIZE:
                buffer.writeUInt16BE(TransportParameterType.MAX_PACKET_SIZE, offset);
                offset += 2;
                buffer.writeUInt16BE(this.maxPacketSize, offset);
                offset += 2;
                break;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                buffer.writeUInt16BE(TransportParameterType.ACK_DELAY_EXPONENT, offset);
                offset += 2;
                buffer.writeUInt8(this.ackDelayExponent, offset);
                offset += 1;
                break;
            case TransportParameterType.OMIT_CONNECTION_ID:
                buffer.writeUInt16BE(TransportParameterType.OMIT_CONNECTION_ID, offset);
                offset += 2;
                break;
        }
        return {buffer: buffer, offset: offset};
    }

    private getBufferSize(): number {
        var size = 0;
        // max stream data: 2 byte for type, 4 byte for value
        size += 2 + 4;
        // max data: 2 byte for type, 4 byte for value
        size += 2 + 4;
        // idle timeout: 2 byte for type, 2 byte for value
        size += 2 + 2;
        if (this.maxStreamIdBidi !== undefined) {
            // max stream id for bidirectional streams: 2 byte for type, 4 byte for value
            size += 2 + 4;
        }
        if (this.maxStreamIdUni !== undefined) {
            // max stream id for unidirectional streams: 2 byte for type, 4 byte for value
            size += 2 + 4;
        }
        if (this.omitConnectionId !== undefined && this.omitConnectionId) {
            // omit connection id: only 2 byte for type
            size += 2;
        }
        if (this.maxPacketSize !== undefined) {
            // max size for a packet: 2 byte for type, 2 byte for value
            size += 2 + 2;
        }
        if (this.ackDelayExponent !== undefined) {
            // ack delay exponent: 2 byte for type, 1 for the exponent
            size += 2 + 1;
        }
        if (this.isServer) {
            // stateless reset token: 2 byte for type, 16 byte for value
            size += 2 + 16;
        }
        return size;
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
import { Constants } from '../utilities/constants';
import { EndpointType } from '../types/endpoint.type';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';


// hardcoded, in this order, at https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.1
// TODO: section 6.4.4 mentions 3 more version negotation validation parameters, but doesn't explain this in detail... should add these though? 
// https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.4
// code example in #6.4 adds these as uint32 before all the rest? still not very clear... 
// for more inspiration: https://github.com/NTAP/quant/blob/master/lib/src/tls.c#L400
// apparently, the whole <4..2^8-4> syntax is not well defined (asked Lars Eggert on slack) and subject to interpretation... *head desk*
export enum TransportParameterType {
    MAX_STREAM_DATA = 0x00,             // max data in-flight for one individual stream
    MAX_DATA = 0x01,                    // max data in-flight for the full connection
    INITIAL_MAX_STREAMS_BIDI = 0x02,    // maximum amount of bi-directional streams that can be opened // UPDATE-12 TODO: rename to initial_max_bidi_streams
    IDLE_TIMEOUT = 0x03,                // amount of seconds to wait before closing the connection if nothing is received
    PREFERRED_ADDRESS = 0x04,           // server address to switch to after completing handshake // UPDATE-12 TODO: actually use this in the implementation somewhere 
    MAX_PACKET_SIZE = 0x05,             // maximum total packet size (at UDP level)
    STATELESS_RESET_TOKEN = 0x06,       // token to be used in the case of a stateless reset 
    ACK_DELAY_EXPONENT = 0x07,          // congestion control tweaking parameter, see congestion/ack handling logic 
    INITIAL_MAX_STREAMS_UNI = 0x08      // maximum amount of uni-directional streams that can be opened// UPDATE-12 TODO: rename to initial_max_uni_streams
}

/**
 * The Transport parameters need to be flexible and also support unknown values (which we ignore afterwards)
 * Thus, this class uses generic get/set based on an enum to keep things flexible and easily parse-able
 */
export class TransportParameters {

    private isServer: boolean;

    private maxStreamData: number;
    private maxData: number;
    private maxStreamIdBidi!: number;
    private maxStreamIdUni!: number;
    private idleTimeout: number;
    private maxPacketSize!: number;
    private statelessResetToken!: Buffer;
    private ackDelayExponent!: number;

    // these three parameters MUST be set for each connection, so we require them in the constructor 
    public constructor(isServer: boolean, maxStreamData: number, maxData: number, idleTimeout: number) {
        this.isServer = isServer;
        this.maxStreamData = maxStreamData;
        this.maxData = maxData;
        this.idleTimeout = idleTimeout;
    }

    // REFACTOR TODO: most of these values have a minimum and maximum allowed value: check for these here! 
    // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.1
    public setTransportParameter(type: TransportParameterType, value: any): void {
        switch (type) {
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
            case TransportParameterType.INITIAL_MAX_STREAMS_BIDI:
                this.maxStreamIdBidi = value;
                break;
            case TransportParameterType.INITIAL_MAX_STREAMS_UNI:
                this.maxStreamIdUni = value;
                break;
            case TransportParameterType.MAX_PACKET_SIZE:
                this.maxPacketSize = value;
                break;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                this.ackDelayExponent = value;
                break;
        }
    }

    public getTransportParameter(type: TransportParameterType): any {
        switch (type) {
            case TransportParameterType.MAX_STREAM_DATA:
                return this.maxStreamData;
            case TransportParameterType.MAX_DATA:
                return this.maxData;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                return this.statelessResetToken;
            case TransportParameterType.IDLE_TIMEOUT:
                return this.idleTimeout;
            case TransportParameterType.INITIAL_MAX_STREAMS_BIDI:
                return this.maxStreamIdBidi;
            case TransportParameterType.INITIAL_MAX_STREAMS_UNI:
                return this.maxStreamIdUni;
            case TransportParameterType.MAX_PACKET_SIZE:
                return this.maxPacketSize === undefined ? Constants.MAX_PACKET_SIZE : this.maxPacketSize;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                return this.ackDelayExponent === undefined ? Constants.DEFAULT_ACK_EXPONENT : this.ackDelayExponent;
        }
        return undefined;
    }

    public toBuffer(): Buffer {
        var buffer = Buffer.alloc(this.getBufferSize());
        var offset = 0;
        var bufferOffset: BufferOffset = {
            buffer: buffer,
            offset: offset
        };
        bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_STREAM_DATA, bufferOffset, this.maxStreamData);
        bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_DATA, bufferOffset, this.maxData);
        bufferOffset = this.writeTransportParameter(TransportParameterType.IDLE_TIMEOUT, bufferOffset, this.idleTimeout);
        if (this.isServer) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, bufferOffset, this.statelessResetToken);
        }
        if (this.maxStreamIdBidi !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAMS_BIDI, bufferOffset, this.maxStreamIdBidi);
        }
        if (this.maxStreamIdUni !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAMS_UNI, bufferOffset, this.maxStreamIdUni);
        }
        if (this.maxPacketSize !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_PACKET_SIZE, bufferOffset, this.maxPacketSize);
        }
        if (this.ackDelayExponent !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT, bufferOffset, this.ackDelayExponent);
        }
        return bufferOffset.buffer;
    }

    private writeTypeAndLength(type: TransportParameterType, buffer: Buffer, offset: number, length: number): BufferOffset {
        buffer.writeUInt16BE(type, offset);
        offset += 2;
        buffer.writeUInt16BE(length, offset);
        offset += 2;
        return {
            buffer: buffer,
            offset: offset
        }
    }

    private writeTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset, value: number): BufferOffset;
    private writeTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset, value: Buffer): BufferOffset;
    private writeTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset, value: any): BufferOffset {
        bufferOffset = this.writeTypeAndLength(type, bufferOffset.buffer, bufferOffset.offset, this.getTransportParameterTypeByteSize(type));
        if (value instanceof Buffer) {
            value.copy(bufferOffset.buffer, bufferOffset.offset);
        } else {
            bufferOffset.buffer.writeUIntBE(value, bufferOffset.offset, this.getTransportParameterTypeByteSize(type));
        }
        bufferOffset.offset += this.getTransportParameterTypeByteSize(type);
        return bufferOffset;
    }

    private getBufferSize(): number {
        var size = 0;
        // max stream data: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.MAX_STREAM_DATA);
        // max data: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.MAX_DATA);
        // idle timeout: 2 byte for type, 2 byte for length and 2 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.IDLE_TIMEOUT);
        if (this.maxStreamIdBidi !== undefined) {
            // max stream id for bidirectional streams: 2 byte for type,2 byte for length and 2 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAMS_BIDI);
        }
        if (this.maxStreamIdUni !== undefined) {
            // max stream id for unidirectional streams: 2 byte for type,2 byte for length and 2 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAMS_UNI);
        }
        if (this.maxPacketSize !== undefined) {
            // max size for a packet: 2 byte for type, 2 byte for length and 2 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.MAX_PACKET_SIZE);
        }
        if (this.ackDelayExponent !== undefined) {
            // ack delay exponent: 2 byte for type, 2 byte for length and 1 for the exponent
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.ACK_DELAY_EXPONENT);
        }
        if (this.isServer) {
            // stateless reset token: 2 byte for type, 2 byte for length and 16 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.STATELESS_RESET_TOKEN);
        }
        return size;
    }

    public static fromBuffer(isServer: boolean, buffer: Buffer): TransportParameters {
        var values: { [index: number]: any; } = [];
        var offset = 0;
        var transportParameters = new TransportParameters(isServer, -1, -1, -1);
        while (offset < buffer.byteLength) {
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
                throw new QuicError(ConnectionErrorCodes.TRANSPORT_PARAMETER_ERROR, "Dual transport parameter defined " + type);
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

    private getTransportParameterTypeByteSize(type: TransportParameterType): number {
        switch (type) {
            case TransportParameterType.MAX_STREAM_DATA:
                return 4;
            case TransportParameterType.MAX_DATA:
                return 4;
            case TransportParameterType.INITIAL_MAX_STREAMS_BIDI:
                return 2;
            case TransportParameterType.IDLE_TIMEOUT:
                return 2;
            case TransportParameterType.PREFERRED_ADDRESS:
                return 4; // UPDATE-12 : draft doesn't specify how large this one can get... different for v4-v6... and a full struct... PITA
            case TransportParameterType.MAX_PACKET_SIZE:
                return 2;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                return 16;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                return 1;
            case TransportParameterType.INITIAL_MAX_STREAMS_UNI:
                return 2;
        }
        return 0;
    }
}

export interface BufferOffset {
    buffer: Buffer,
    offset: number
}
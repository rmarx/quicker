import { Constants } from '../utilities/constants';
import { EndpointType } from '../types/endpoint.type';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { Version, ConnectionID } from '../packet/header/header.properties';
import { HandshakeState } from './qtls';
import { Bignum } from '../types/bignum';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { VLIE } from '../types/vlie';


// hardcoded, in this order, at https://tools.ietf.org/html/draft-ietf-quic-transport-20#section-18.1
export enum TransportParameterId {

    ORIGINAL_CONNECTION_ID              = 0x0000, // The original connection id from the INITIAL packet, only used when sending RETRY packet 
    IDLE_TIMEOUT                        = 0x0001, // amount of seconds to wait before closing the connection if nothing is received
    STATELESS_RESET_TOKEN               = 0x0002, // token to be used in the case of a stateless reset 
    MAX_PACKET_SIZE                     = 0x0003, // maximum total packet size (at UDP level)
    INITIAL_MAX_DATA                    = 0x0004, // max data in-flight for the full connection

    INITIAL_MAX_STREAM_DATA_BIDI_LOCAL  = 0x0005, // max data we are willing to receive from our peer on streams that we ourselves opened
    INITIAL_MAX_STREAM_DATA_BIDI_REMOTE = 0x0006, // max data we are willing to receive from our peer on streams that they opened 
    INITIAL_MAX_STREAM_DATA_UNI         = 0x0007, // max data we are willing to receive from our peer on streams that they opened 


    INITIAL_MAX_STREAMS_BIDI            = 0x0008, // maximum amount of bi-directional streams that can be opened
    INITIAL_MAX_STREAMS_UNI             = 0x0009, // maximum amount of uni-directional streams that can be opened

    ACK_DELAY_EXPONENT                  = 0x000a, // congestion control tweaking parameter, see congestion/ack handling logic 
    MAX_ACK_DELAY                       = 0x000b, // maximum amount of MILLIseconds this endpoint will delay sending acks

    DISABLE_MIGRATION                   = 0x000c, // boolean to disable migration-related features
    PREFERRED_ADDRESS                   = 0x000d, // server address to switch to after completing handshake // UPDATE-12 TODO: actually use this in the implementation somewhere 
    ACTIVE_CONNECTION_ID_LIMIT          = 0x000e  // The maximum number of connection IDs from the peer that an endpoint is willing to store
}

enum TransportParameterType{
    ConnectionID = "ConnectionID",
    uint64       = "uint64",
    Buffer       = "Buffer",
    boolean      = "boolean"
}

enum TransportParameterTypeLookup{
    ORIGINAL_CONNECTION_ID              = TransportParameterType.ConnectionID,
    IDLE_TIMEOUT                        = TransportParameterType.uint64,
    STATELESS_RESET_TOKEN               = TransportParameterType.Buffer,
    MAX_PACKET_SIZE                     = TransportParameterType.uint64,
    INITIAL_MAX_DATA                    = TransportParameterType.uint64,

    INITIAL_MAX_STREAM_DATA_BIDI_LOCAL  = TransportParameterType.uint64,
    INITIAL_MAX_STREAM_DATA_BIDI_REMOTE = TransportParameterType.uint64,
    INITIAL_MAX_STREAM_DATA_UNI         = TransportParameterType.uint64,


    INITIAL_MAX_STREAMS_BIDI            = TransportParameterType.uint64,
    INITIAL_MAX_STREAMS_UNI             = TransportParameterType.uint64,

    ACK_DELAY_EXPONENT                  = TransportParameterType.uint64,
    MAX_ACK_DELAY                       = TransportParameterType.uint64,

    DISABLE_MIGRATION                   = TransportParameterType.boolean,
    PREFERRED_ADDRESS                   = TransportParameterType.Buffer,
    ACTIVE_CONNECTION_ID_LIMIT          = TransportParameterType.uint64,
}

/**
 * The Transport parameters need to be flexible and also support unknown values (which we ignore afterwards)
 * Thus, this class uses generic get/set based on an enum to keep things flexible and easily parse-able
 */
export class TransportParameters {

    private isServer: boolean;

    /*
    private maxStreamDataBidiLocal: number;
    private maxStreamDataBidiRemote: number;
    private maxStreamDataUni: number;
    private maxData: number;
    private maxStreamIdBidi!: number;
    private maxStreamIdUni!: number;
    private idleTimeout: number;
    private maxPacketSize!: number;
    private statelessResetToken!: Buffer;
    private ackDelayExponent!: number;

    private disableMigration!: boolean;
    private activeConnIDLimit!: number;
    */

    // these are the known/supported Transport Parameters, listed in TransportParameterId
    private tps:Map<TransportParameterId, ConnectionID|number|boolean|Buffer> = new Map<TransportParameterId, ConnectionID|number|boolean|Buffer>();

    // these are unknown TPs
    // when sending, this is used for greasing the TPs
    // when receiving, this stores the received TPs that were of an unknown type (not really needed, just handy for debugging)
    private unknownTps:Map<number, Buffer> = new Map<number, Buffer>();


    protected constructor(isServer: boolean) {
        this.isServer = isServer;
    }

    // REFACTOR TODO: most of these values have a minimum and maximum allowed value: check for these here! 
    // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.1
    public setTransportParameter(type: TransportParameterId, value: any): void {
        this.tps.set( type, value );
        // TODO: validate minima and maxima (e.g., MAX_PACKET_SIZE cannot be less than 1200 etc.)
        // TODO: need to then also handle what happens if there is an invalid value here! 
    }

    public getTransportParameter(type: TransportParameterId): any {
        if( this.tps.has(type) ){
            return this.tps.get(type);
        }
        else{
            // Default values depend on the parameter 
            // only some have values that are not 0 or false or empty
            switch( type ){
                case TransportParameterId.MAX_PACKET_SIZE:
                    return Constants.DEFAULT_MAX_PACKET_SIZE;
                case TransportParameterId.ACK_DELAY_EXPONENT:
                    return Constants.DEFAULT_ACK_DELAY_EXPONENT;
                case TransportParameterId.MAX_ACK_DELAY:
                    return Constants.DEFAULT_MAX_ACK_DELAY;
            }

            switch( TransportParameterTypeLookup[type] ){
                case TransportParameterType.uint64:
                    return 0;
                case TransportParameterType.boolean:
                    return false;
                case TransportParameterType.ConnectionID:
                case TransportParameterType.Buffer:
                    return undefined;
            }
        }
    }

    private getTransportParametersBuffer(): Buffer {
 
        // we need to pre-alloc a buffer but don't know how large stuff is going to be
        // so, we pre-alloc enough to be sure to fit everything
        // this wastes a bit of space, but *should* be faster

        let maxSize = 2; // full length is pre-pended as uint16
        for( let entry of this.tps.entries() ){
            maxSize += 4; // 2 bytes for type, 2 bytes for length for each entry

            // entry[0] is an integer
            // TransportParameterType has integer keys, but TransportParameterInternalTypeLookup does NOT!
            // so, transform to the string key, so we can look it up in TransportParameterInternalTypeLookup
            let idString = TransportParameterId[entry[0]];
            let tpType = (<any>TransportParameterTypeLookup)[idString] as TransportParameterType;
            VerboseLogging.trace("TransportParameters:getTransportParametersBuffer : adding maxsize for " + entry[0] + " // " + TransportParameterId[entry[0]] + " -> " + tpType);

            if( tpType === TransportParameterType.uint64 )
                maxSize += 8; // varints in QUIC are a maximum of 8 bytes long
            else if( tpType === TransportParameterType.Buffer )
                maxSize += (entry[1] as Buffer).byteLength;
            else if( tpType === TransportParameterType.ConnectionID )
                maxSize += 18; // connectionIDs are a max of 18 bytes long in QUIC
            else // boolean
                maxSize += 0; // zero-length encoded, no actual value present
        }

        for( let entry of this.unknownTps.entries() ){
            VerboseLogging.trace("TransportParameters:getTransportParametersBuffer : adding maxsize for greased " + entry[0] );
            maxSize += 4; // 2 bytes for type, 2 bytes for length for each entry
            maxSize += entry[1].byteLength;
        }

        VerboseLogging.trace("TransportParameters:getTransportParametersBuffer : calculated MaxSize is " + maxSize + " bytes");

        let buffer = Buffer.alloc(maxSize);
        let bufferOffset: BufferOffset = {
            buffer: buffer,
            offset: 0
        };

        // placeholder for the total length, which we overwrite at the end
        bufferOffset.offset = bufferOffset.buffer.writeUInt16BE(0xbeef, bufferOffset.offset);

        // cannot just iterate over TypeScript enum apparently
        // it saves our TransportParameterType as an Object with first all the numbers as keys, with associated strings
        // then the strings are also added as keys, with the numbers as values
        // in our Map, it chooses the numbers as keys, since we reference them by string names
        // some very dirty <any> casting allows us to do the .has() as expected
        // see also https://blog.oio.de/2014/02/28/typescript-accessing-enum-values-via-a-string/

        for (let tpIdString in TransportParameterId ) {

            // tpIdString is the string (e.g., "IDLE_TIMEOUT"), tpIdNumber is the number (e.g., 0x0001)
            // this.tps is indexed on the NUMBERS, but TransportParameterTypeLookup requires the string
            let tpIdNumber:TransportParameterId = ((<any>TransportParameterId)[tpIdString] as TransportParameterId);

            // only include explicitly set parameters
            if ( !this.tps.has(tpIdNumber) ){ // will only return true if it was set before + if tptype is one of the string keys returning an int (since this.tps indexes on ints)
                continue;
            }

            let tpType:TransportParameterType = (<any>TransportParameterTypeLookup)[tpIdString] as TransportParameterType;
            VerboseLogging.trace("getTransportParametersBuffer: encoding " + TransportParameterId[tpIdNumber] + " with internal type " + TransportParameterType[tpType] );

            switch( tpType ){
                case TransportParameterType.uint64:
                    // yes, as you might have noticed, the length is doubly encoded here: once in 2 bytes before the value, then as a varint as well
                    // I asked Marten Seemann (https://github.com/quicwg/base-drafts/issues/1608) about this and he says:
                    // - the 2 bytes up-front are needed so we can skip unknown TPs
                    // - we do not use the 2 bytes to indicate the varint length, because we want to prevent a second varint encoding for consistency
                    // So we are stuck with encoding the length twice. There seems to have been quite a bit of discussion about this, none of it on the github issues though
                    let encodedBuffer = VLIE.encode( this.tps.get(tpIdNumber) as number );

                    bufferOffset = this.writeIdAndLength(tpIdNumber, bufferOffset.buffer, bufferOffset.offset, encodedBuffer.byteLength);
                    bufferOffset.offset += encodedBuffer.copy( bufferOffset.buffer, bufferOffset.offset );
                break;

                case TransportParameterType.boolean:
                    // booleans are zero-length: if they are there, their value is implied to be true
                    bufferOffset = this.writeIdAndLength(tpIdNumber, bufferOffset.buffer, bufferOffset.offset, 0);
                break;

                case TransportParameterType.Buffer:
                    let bufval = this.tps.get(tpIdNumber) as Buffer;
                    bufferOffset = this.writeIdAndLength(tpIdNumber, bufferOffset.buffer, bufferOffset.offset, bufval.byteLength);
                    bufferOffset.offset += bufval.copy(bufferOffset.buffer, bufferOffset.offset);
                break;

                case TransportParameterType.ConnectionID:
                    let cid = this.tps.get(tpIdNumber) as ConnectionID;
                    let cidval = cid.toBuffer();

                    bufferOffset = this.writeIdAndLength(tpIdNumber, bufferOffset.buffer, bufferOffset.offset, cidval.byteLength);
                    bufferOffset.offset += cidval.copy(bufferOffset.buffer, bufferOffset.offset);
                break;
            }

            //VerboseLogging.trace("getTransportParametersBuffer: output is now " + bufferOffset.buffer.toString('hex', 0, bufferOffset.offset) );
        }

        for( let entry of this.unknownTps ){
            VerboseLogging.trace("getTransportParametersBuffer: encoding greased TP : " + entry[0] );

            bufferOffset = this.writeIdAndLength(entry[0], bufferOffset.buffer, bufferOffset.offset, entry[1].byteLength);
            bufferOffset.offset += entry[1].copy(bufferOffset.buffer, bufferOffset.offset);

            //VerboseLogging.trace("getTransportParametersBuffer: output is now " + bufferOffset.buffer.toString('hex', 0, bufferOffset.offset) );
        }

        let totalLength = bufferOffset.offset - 2; // -2 because the length placeholder is also included in the buffer
        bufferOffset.buffer.writeUInt16BE(totalLength, 0);

        // now we know the correct size, create new memory and move correct size into that
        let outputBuffer = Buffer.alloc( bufferOffset.offset );
        bufferOffset.buffer.copy(outputBuffer, 0, 0, bufferOffset.offset); 

        VerboseLogging.trace("getTransportParametersBuffer: finalOutput is " + outputBuffer.toString('hex') );

        delete bufferOffset.buffer; // shouldn't be needed, but let's make sure, shall we? 

        return outputBuffer;
    }


    private writeIdAndLength(id: number, targetBuffer: Buffer, targetOffset: number, tpValueByteLength: number): BufferOffset {
        targetBuffer.writeUInt16BE(id, targetOffset);
        targetOffset += 2;
        targetBuffer.writeUInt16BE(tpValueByteLength, targetOffset);
        targetOffset += 2;
        return {
            buffer: targetBuffer,
            offset: targetOffset
        }
    }

    /*
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
    */

    public toBuffer(): Buffer {
        //var transportParameterersBuffer = this.getTransportParametersBuffer();
        //var buf = Buffer.alloc(transportParameterersBuffer.byteLength);
        //buf.write(this.version.toString(), 0, 4, 'hex');
        //transportParameterersBuffer.copy(buf, 4);
        return this.getTransportParametersBuffer();
    }

    public toExtensionDataBuffer(handshakeState: HandshakeState): Buffer {
        return this.getTransportParametersBuffer();
        /*
        var transportExt = Buffer.alloc(this.getExtensionDataSize(transportParamBuffer, handshakeState));
        var offset = 0;
        if (this.isServer) {
            // version in the connection holds the negotiated version
            transportExt.write(version.toString(), offset, 4, 'hex');
            offset += 4;
            transportExt.writeUInt8(Constants.SUPPORTED_VERSIONS.length * 4, offset++);
            Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                transportExt.write(version, offset, 4, 'hex');
                offset += 4;
            });
        } else {
            transportExt.write(version.toString(), offset, 4, 'hex');
            offset += 4;
        }
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, offset);
        offset += 2;
        transportParamBuffer.copy(transportExt, offset);
        return transportExt;
        */
    }

    /*
    private writeZeroLengthTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset){
        // zero-length = boolean : if the parameter is present, value is automatically 1, so length is 0
        bufferOffset = this.writeTypeAndLength(type, bufferOffset.buffer, bufferOffset.offset, 0);
        return bufferOffset;
    }
    */

    /*
    private getBufferSize(): number {
        var size = 0;
        // max stream data parameters: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL);
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE);
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI);
        // max data: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_DATA);
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
        if( this.disableMigration ){
            // disable migration: is a zero-length value, so: 2 byte for type, 2 byte for length (which is always 0) and that's it
            // means: if present, it's set, if left out, it's not set 
            size += 2 + 2; // this.getTransportParameterTypeByteSize(TransportParameterType.DISABLE_MIGRATION);
        }
        return size;
    }
    */

    /**
     * Rebuild transport parameters from a buffer object which is obtained from the other endpoint and received from C++ side.
     *  function is for internal use.
     */
    public static fromExtensionBuffer(isServer: boolean, buffer: Buffer): TransportParameters {

        VerboseLogging.trace("TransportParameters:fromExtensionBuffer : " + buffer.toString("hex"));

        //let values: { [index: number]: any; } = [];
        let offset = 0;
        let transportParameters = TransportParameters.getEmptyTransportParameters(isServer);

        let totalLength = buffer.readUInt16BE(0);
        offset += 2;

        if( totalLength != (buffer.byteLength - 2) ){
            VerboseLogging.warn("TransportParameters:fromExtensionBuffer : buffer length != length field in the TPs! " + buffer.byteLength + " != " + totalLength);
        }

        while (offset < buffer.byteLength) {
            let tpIdNumber = buffer.readUInt16BE(offset);
            offset += 2;
            let valueLength = buffer.readUInt16BE(offset);
            offset += 2;

            let validTp:boolean = TransportParameterId[tpIdNumber] !== undefined;
            if( validTp ){
                
                let tpIdString:TransportParameterId = ((<any>TransportParameterId)[tpIdNumber] as TransportParameterId);
                let tpType:TransportParameterType = (<any>TransportParameterTypeLookup)[tpIdString] as TransportParameterType;
                VerboseLogging.trace("fromExtensionBuffer: decoding " + TransportParameterId[tpIdNumber] + " with internal type " + TransportParameterType[tpType] );
    
                if( transportParameters.tps.has(tpIdNumber) ){
                    VerboseLogging.error("fromExtensionBuffer: decoding : Duplicate TP detected " + TransportParameterId[tpIdNumber] + ". This MUST result in connection closure, but we don't do that yet!");
                }

                switch( tpType ){
                    case TransportParameterType.uint64:
                    
                        let decodedVarint = VLIE.decode(buffer, offset);
                        let tpValue = decodedVarint.value;

                        if( decodedVarint.offset - offset != valueLength )
                            VerboseLogging.warn("fromExtensionBuffer : VLIE length was not the same as prepended length! " + (decodedVarint.offset - offset) + " != " + valueLength );

                        offset = decodedVarint.offset;
    
                        VerboseLogging.trace("fromExtensionBuffer: adding uint64 " + TransportParameterId[tpIdNumber] + " = " + tpValue.toDecimalString());
                        
                        // FIXME: add support for Bignums (not just do everything as number!)
                        try{
                            let tpNumberValue:number = tpValue.toNumber();
                            transportParameters.tps.set( tpIdNumber, tpNumberValue );
                        }
                        catch(e){
                            // was a number larger than 2^53, so we will truncate, but log error!
                            VerboseLogging.error("TransporParameters:fromExtensionBuffer : uint64 was actually larger than 2^53, truncating to MAX_SAFE_INTEGER! " + tpValue.toDecimalString() + ", " + tpValue.toString('hex') );
                            transportParameters.tps.set( tpIdNumber, Number.MAX_SAFE_INTEGER );
                        }
                    break;
    
                    case TransportParameterType.boolean:
                        VerboseLogging.trace("fromExtensionBuffer: adding boolean " + TransportParameterId[tpIdNumber] + " = " + true);
                        transportParameters.tps.set( tpIdNumber, true );
                    break;
    
                    case TransportParameterType.Buffer:
                        let tpBufValue = Buffer.alloc(valueLength);
                        buffer.copy( tpBufValue, 0, offset, offset + valueLength );
                        offset = offset + valueLength;

                        VerboseLogging.trace("fromExtensionBuffer: adding buffer " + TransportParameterId[tpIdNumber] + " = " + tpBufValue.toString('hex'));
                        transportParameters.tps.set( tpIdNumber, tpBufValue );
                    break;
    
                    case TransportParameterType.ConnectionID:
                        let tpCidValue = Buffer.alloc(valueLength);
                        buffer.copy( tpCidValue, 0, offset, offset + valueLength );
                        offset = offset + valueLength;

                        VerboseLogging.trace("fromExtensionBuffer: adding ConnectionID " + TransportParameterId[tpIdNumber] + " = " + tpCidValue.toString('hex'));
                        let cid = new ConnectionID( tpCidValue, valueLength );
                        transportParameters.tps.set( tpIdNumber, cid );
                    break;
                }
            }
            // invalid tp id: unknown tp, save it in separate Map
            else{
                let tpValue = Buffer.alloc(valueLength);
                buffer.copy( tpValue, 0, offset, offset + valueLength );
                offset = offset + valueLength;

                VerboseLogging.trace("fromExtensionBuffer: Unknown TP : " + tpIdNumber + " = " + tpValue.toString('hex'));
                transportParameters.unknownTps.set( tpIdNumber, tpValue );
            }
        }
            /*
            var value = undefined;
            if (valueLength > 4) {
                value = Buffer.alloc(valueLength);
                buffer.copy(value, 0, offset, offset + valueLength);
            } else if( valueLength > 0 ) {
                value = buffer.readUIntBE(offset, valueLength);
            }
            else{
                value = true; // 0-length transport parameters are booleans: if they're present, their value is true
            }
            offset += valueLength;
            if (tpId in values) {
                throw new QuicError(ConnectionErrorCodes.TRANSPORT_PARAMETER_ERROR, "Dual transport parameter defined " + tpId);
            }
            values[tpId] = value;
        }
        for (let key in values) {
            // Ignore unknown transport parameters
            if (key in TransportParameterId) {
                transportParameters.setTransportParameter(Number(key), values[key]);
            } else {
            }
        }
        */
        return transportParameters;
    }

    public static fromBuffer(isServer: boolean, buffer: Buffer): TransportParameters {
        return TransportParameters.fromExtensionBuffer(isServer, buffer);
    }

    /*
    private getTransportParameterTypeByteSize(type: TransportParameterType): number {
        switch (type) {
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL:
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE:
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI:
                return 4;
            case TransportParameterType.INITIAL_MAX_DATA:
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
            case TransportParameterType.DISABLE_MIGRATION:
                return 0;
        }
        return 0;
    }
    */

    public static getEmptyTransportParameters(isServer: boolean): TransportParameters {
        return new TransportParameters(isServer);
    }
    
    public static getDefaultTransportParameters(isServer: boolean): TransportParameters {
        let transportParameters = new TransportParameters(isServer);

        // TODO: does it make sense to set some of these if they are the default values mentioned in the spec?
        // they only take up space... 
        transportParameters.setTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL,     Constants.DEFAULT_MAX_STREAM_DATA ); 
        transportParameters.setTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE,    Constants.DEFAULT_MAX_STREAM_DATA ); 
        transportParameters.setTransportParameter( TransportParameterId.INITIAL_MAX_STREAM_DATA_UNI,            Constants.DEFAULT_MAX_STREAM_DATA ); 
        transportParameters.setTransportParameter( TransportParameterId.INITIAL_MAX_DATA,                       Constants.DEFAULT_MAX_DATA ); 
        transportParameters.setTransportParameter( TransportParameterId.IDLE_TIMEOUT,                           Constants.DEFAULT_IDLE_TIMEOUT ); 

        transportParameters.setTransportParameter(TransportParameterId.ACK_DELAY_EXPONENT,                      Constants.DEFAULT_ACK_DELAY_EXPONENT);
        transportParameters.setTransportParameter(TransportParameterId.MAX_ACK_DELAY,                           Constants.DEFAULT_MAX_ACK_DELAY);
        transportParameters.setTransportParameter(TransportParameterId.ACTIVE_CONNECTION_ID_LIMIT,              Constants.DEFAULT_ACTIVE_CONNECTION_ID_LIMIT);
        
        if( Constants.DEFAULT_DISABLE_MIGRATION )
            transportParameters.setTransportParameter(TransportParameterId.DISABLE_MIGRATION,                   Constants.DEFAULT_DISABLE_MIGRATION);

        if (isServer) {
            transportParameters.setTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_BIDI,            Constants.DEFAULT_MAX_STREAM_CLIENT_BIDI);
            transportParameters.setTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_UNI,             Constants.DEFAULT_MAX_STREAM_CLIENT_UNI);
            // TODO: better to calculate this value
            transportParameters.setTransportParameter(TransportParameterId.STATELESS_RESET_TOKEN,               Bignum.random('ffffffffffffffffffffffffffffffff', 16).toBuffer());
        } else {
            transportParameters.setTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_BIDI,            Constants.DEFAULT_MAX_STREAM_SERVER_BIDI);
            transportParameters.setTransportParameter(TransportParameterId.INITIAL_MAX_STREAMS_UNI,             Constants.DEFAULT_MAX_STREAM_SERVER_UNI);
        }

        if( Constants.DEBUG_greaseTransportParameters ){
            transportParameters.unknownTps.set( 0xffff, Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xff]));
            transportParameters.unknownTps.set( 0x1234, Buffer.from([0xde, 0xad, 0xbe, 0xef]));
            transportParameters.unknownTps.set( 0xea5e, Buffer.from([0xea, 0x5e]));
        }

        return transportParameters;
    }

    public toJSONstring(prettyPrint:boolean = false){

        let known:any = {};
        let unknown:any = {};

        for( let entry of this.tps.entries() ){

            let idString = TransportParameterId[entry[0]];
            let tpType = (<any>TransportParameterTypeLookup)[idString] as TransportParameterType;

            if( tpType === TransportParameterType.uint64 )
                known[ idString ] = "" + entry[1];
            else if( tpType === TransportParameterType.Buffer )
                known[ idString ] = "" + (entry[1] as Buffer).toString('hex');
            else if( tpType === TransportParameterType.ConnectionID )
                known[ idString ] = "" + (entry[1] as ConnectionID).toBuffer().toString('hex');
            else // boolean
                known[ idString ] = "" + (entry[1] as boolean);
        }

        for( let entry of this.unknownTps.entries() ){
            unknown[ entry[0] ] = entry[1].toString('hex');
        }

        return JSON.stringify( 
        {
            known: known,
            unknown: unknown
        }, 
        null, prettyPrint ? 4  : 0 );
    }

    /**
     * Calculate the size of the buffer which is passed to C++ for openssl
     */
    /*
    private getExtensionDataSize(transportParamBuffer: Buffer, handshakeState: HandshakeState): number {
        if (this.isServer) {
            if (handshakeState === HandshakeState.HANDSHAKE) {
                return transportParamBuffer.byteLength + 6 + Constants.SUPPORTED_VERSIONS.length * 4 + 1;
            }
            return transportParamBuffer.byteLength + 2;
        }
        return transportParamBuffer.byteLength + 6;
    }
    */
}

export interface BufferOffset {
    buffer: Buffer,
    offset: number
}
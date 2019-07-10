import {BasePacket, PacketType} from './base.packet';
import {BaseFrame, FrameType} from '../frame/base.frame';
import {BaseHeader, HeaderType} from './header/base.header';
import {Connection} from '../quicker/connection';
import {Constants} from '../utilities/constants';
import {PaddingFrame} from '../frame/padding';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { LongHeaderType } from './header/long.header';
import { FrameFactory } from '../utilities/factories/frame.factory';


export abstract class BaseEncryptedPacket extends BasePacket {
    
    protected frames: BaseFrame[];

    public constructor(packetType: PacketType, header: BaseHeader, frames: BaseFrame[]) {
        super(packetType,header);
        this.frames = frames;
        this.retransmittableCheck(frames);
    }

    public getFrames(): BaseFrame[] {
        return this.frames;
    }

    public toBuffer(connection: Connection) {
        let unencryptedHeader:Buffer = this.getHeader().toUnencryptedBuffer();
        let payload:Buffer           = this.getFramesBuffer(connection, this.getHeader());

        let headerAndEncryptedPayload:Buffer = Buffer.concat([unencryptedHeader,payload]);

        let encryptedPacket:Buffer|undefined = undefined;
        if( this.getHeader().getHeaderType() === HeaderType.LongHeader ){

            if (this.getHeader().getPacketType() === LongHeaderType.Protected0RTT) {
                encryptedPacket = connection.getAEAD().protected0RTTHeaderEncrypt(this.getHeader(), headerAndEncryptedPayload);
            }
            else if( this.getHeader().getPacketType() === LongHeaderType.Handshake ){
                encryptedPacket = connection.getAEAD().protectedHandshakeHeaderEncrypt(this.getHeader(), headerAndEncryptedPayload, connection.getEndpointType()); 
            } 
            else {
                encryptedPacket = connection.getAEAD().clearTextHeaderEncrypt(connection.getInitialDestConnectionID(), this.getHeader(), headerAndEncryptedPayload, connection.getEndpointType());
            }
        
        }
        else{ // short header by default
            
            encryptedPacket = connection.getAEAD().protected1RTTHeaderEncrypt(this.getHeader(), headerAndEncryptedPayload, connection.getEndpointType());
             
        }


        //var encryptedPacketBuffer = this.getHeader().toHeaderProtectedBuffer(connection, Buffer.concat([unencryptedHeader,dataBuffer]));

        //console.trace("unencryptedHeader", unencryptedHeader.toString('hex') );

        /*
        var buffer = Buffer.alloc(encryptedPacketBuffer.byteLength + dataBuffer.byteLength);
        var offset = 0;
        encryptedPacketBuffer.copy(buffer, offset);
        offset += encryptedPacketBuffer.byteLength;
        dataBuffer.copy(buffer, offset);
        */
        
        // FIXME: make sure that if something changes in the frames-array (e.g., new element is added / removed), this gets set to -1 again! 
        // just a quick hack to get rid of .toBuffer().bytelength
        this.bufferedLength = (encryptedPacket as Buffer).byteLength;

        return encryptedPacket as Buffer;

    }

    public getFrameSizes(): number {
        var size  = 0;
        this.frames.forEach((frame: BaseFrame) => {
            size += frame.toBuffer().byteLength;
        });
        return size;
    }

    public getSize(): number {
        return this.getHeader().getSize() + this.getFrameSizes();
    }

    protected getFramesBuffer(connection: Connection, header: BaseHeader): Buffer {
        var frameSizes = this.getFrameSizes();
        var dataBuffer = Buffer.alloc(frameSizes);
        var offset = 0;
        this.frames.forEach((frame: BaseFrame) => {
            frame.toBuffer().copy(dataBuffer, offset);
            offset += frame.toBuffer().byteLength;
        });
        if (offset < 4) {
            VerboseLogging.error("Added padding to frame at offset: " + offset);
            let padding = FrameFactory.createPaddingFrame(20);
            dataBuffer = Buffer.concat([dataBuffer, padding.toBuffer()]);
            offset += padding.toBuffer().byteLength;
            VerboseLogging.error("Bufferlength after padding: " + dataBuffer.byteLength + "\toffset: " + offset);
        }
        dataBuffer = this.getEncryptedData(connection, header, dataBuffer);
        return dataBuffer;
    }

    private retransmittableCheck(frames: BaseFrame[]): void {
        let retransmittable = false;
        let ackOnly = true;
        let paddingOnly = true;
        frames.forEach((baseFrame: BaseFrame) => {
            if (baseFrame.isRetransmittable()) {
                retransmittable = true;
                ackOnly = false;
                paddingOnly = false;
            } else if (baseFrame.getType() === FrameType.PADDING) {
                ackOnly = false;
            }
            else if( baseFrame.getType() == FrameType.ACK ){
                paddingOnly = false;
            }
        });
        this.retransmittable = retransmittable;
        this.ackOnly = ackOnly;
        this.paddingOnly = paddingOnly;
    }

    public containsValidFrames(): boolean {
        var isValidPacket = true;

        for( let frame of this.frames ){
            if( this.getValidFrameTypes().indexOf(frame.getType()) === -1 ){
                let isValidFrame = true;
                // stream frame are special in that they cover a full range instead of a single type, so check for that
                // since our validFrameTypes array will only contain STREAM, not all the subtypes 
                if( frame.getType() > FrameType.STREAM && frame.getType() <= FrameType.STREAM_MAX_NR ){
                    if( this.getValidFrameTypes().indexOf(FrameType.STREAM) === -1 ){
                        isValidFrame = false; 
                    }
                }
                else
                    isValidFrame = false;

                if( !isValidFrame ){
                    VerboseLogging.error("BaseEncryptedPacket:containsValidFrames : invalid frame " + FrameType[frame.getType()] + " for packet " + PacketType[this.getPacketType()] );
                    isValidPacket = false; // don't eagerly return here, because we want to log all invalid frames (if more than one)
                }
            }
        }

        return isValidPacket;
    }

    protected abstract getValidFrameTypes(): FrameType[];
    protected abstract getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer;
}
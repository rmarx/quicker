import {BasePacket, PacketType} from './base.packet';
import {BaseFrame, FrameType} from '../frame/base.frame';
import {BaseHeader} from './header/base.header';
import {Connection} from '../quicker/connection';
import {Constants} from '../utilities/constants';
import {PaddingFrame} from '../frame/padding';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { VerboseLogging } from '../utilities/logging/verbose.logging';


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

    /**
     * Method to get buffer object from a Packet object
     */
    public toBuffer(connection: Connection) {
        var unencryptedHeader = this.getHeader().toBuffer();
        var dataBuffer = this.getFramesBuffer(connection, this.getHeader());
        var headerBuffer = this.getHeader().toPNEBuffer(connection, Buffer.concat([unencryptedHeader,dataBuffer]));

        var buffer = Buffer.alloc(headerBuffer.byteLength + dataBuffer.byteLength);
        var offset = 0;
        headerBuffer.copy(buffer, offset);
        offset += headerBuffer.byteLength;
        dataBuffer.copy(buffer, offset);
        
        return buffer;
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
                    VerboseLogging.error("BaseEncryptedPacket:containsValidFrames : invalid frame " + frame.getType() + " for packet " + PacketType[this.getPacketType()] );
                    isValidPacket = false; // don't eagerly return here, because we want to log all invalid frames (if more than one)
                }
            }
        }

        return isValidPacket;
    }

    protected abstract getValidFrameTypes(): FrameType[];
    protected abstract getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer;
}
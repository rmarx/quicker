import {BasePacket, PacketType} from '../base.packet';
import {BaseFrame} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {Connection} from '../../quicker/connection';



export class ShortHeaderPacket extends BasePacket {
    
    private frames: BaseFrame[];

    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Protected1RTT,header);
        this.frames = frames;
    }

    public getFrames(): BaseFrame[] {
        return this.frames;
    }

    public toBuffer(connection: Connection) {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        var frameSizes = this.getFrameSizes();

        var dataBuffer = Buffer.alloc(frameSizes);
        dataBuffer = this.encryptData(connection, this.getHeader(), dataBuffer);

        var buffer = Buffer.alloc(headerBuffer.byteLength + dataBuffer.byteLength);
        var offset = 0;
        headerBuffer.copy(buffer, offset);
        offset += headerBuffer.byteLength;
        dataBuffer.copy(buffer, offset);
        
        return buffer;
    }

    private getFrameSizes() {
        var size  = 0;
        this.frames.forEach((frame: BaseFrame) => {
            size += frame.toBuffer().byteLength;
        });
        return size;
    }

    private encryptData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        var offset = 0;
        this.frames.forEach((frame: BaseFrame) => {
            frame.toBuffer().copy(dataBuffer, offset);
            offset += frame.toBuffer().byteLength;
        });
        dataBuffer = connection.getAEAD().protected1RTTEncrypt(connection, header, dataBuffer, connection.getEndpointType());
        return dataBuffer;
    }
}
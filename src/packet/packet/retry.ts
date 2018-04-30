import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { Connection } from "../../quicker/connection";
import { BaseEncryptedPacket } from "../base.encrypted.packet";
import { FrameType, BaseFrame } from "../../frame/base.frame";
import { StreamFrame } from "../../frame/stream";


export class RetryPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Retry, header, frames);
    }

    /**
     * Method to get buffer object from a RetryPacket object
     */
    public toBuffer(connection: Connection) {
        var headerBuffer = this.getHeader().toBuffer();
        
        return headerBuffer;
    }

    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().clearTextEncrypt(connection, header, dataBuffer, connection.getEndpointType());
    }

    protected getValidFrameTypes(): FrameType[] {
        return [
            FrameType.STREAM, FrameType.ACK
        ];
    }
}
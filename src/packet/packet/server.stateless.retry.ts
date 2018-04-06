import { BasePacket, PacketType } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { Connection } from "../../quicker/connection";
import { BaseEncryptedPacket } from "../base.encrypted.packet";
import { FrameType } from "../../frame/base.frame";
import { StreamFrame } from "../../frame/stream";


export class ServerStatelessRetryPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, streamFrame: StreamFrame) {
        super(PacketType.Retry, header, [streamFrame]);
    }

    /**
     * Method to get buffer object from a ServerStatelessRetryPacket object
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
            FrameType.STREAM
        ];
    }
}
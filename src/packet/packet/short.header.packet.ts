import {PacketType} from '../base.packet';
import {BaseFrame, FrameType} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {Connection} from '../../quicker/connection';
import {BaseEncryptedPacket} from "./../base.encrypted.packet";


export class ShortHeaderPacket extends BaseEncryptedPacket {

    private validFrameTypes: FrameType[];
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Protected1RTT,header, frames);
        this.validFrameTypes = Object.keys(FrameType).filter((item) => {
            return Number(item);
        }).map(function(item) {
            return parseInt(item);
        });;
    }
    
    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().protected1RTTEncrypt(header, dataBuffer, connection.getEndpointType());
    }

    protected getValidFrameTypes(): FrameType[] {
        return this.validFrameTypes;
    }
}
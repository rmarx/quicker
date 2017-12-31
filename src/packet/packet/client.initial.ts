import {BaseFrame} from '../../frame/base.frame';
import {BaseHeader} from '../header/base.header';
import {PacketType} from '../base.packet';
import {Connection} from '../../types/connection';
import {Constants} from '../../utilities/constants';
import {PaddingFrame} from '../../frame/general/padding';
import {BaseEncryptedPacket} from "./../base.encrypted.packet";


export class ClientInitialPacket extends BaseEncryptedPacket {
    
    public constructor(header: BaseHeader, frames: BaseFrame[]) {
        super(PacketType.Handshake,header, frames);
    }

    protected getFrameSizes(): number {
        var size  = super.getFrameSizes();
        if (size < Constants.CLIENT_INITIAL_MIN_SIZE) {
            var padding = new PaddingFrame(Constants.CLIENT_INITIAL_MIN_SIZE - size)
            this.frames.push(padding);
            size = Constants.CLIENT_INITIAL_MIN_SIZE;
        }
        return size;
    }

    protected getEncryptedData(connection: Connection, header: BaseHeader, dataBuffer: Buffer): Buffer {
        return connection.getAEAD().clearTextEncrypt(connection, header, dataBuffer, connection.getEndpointType());
    }
}
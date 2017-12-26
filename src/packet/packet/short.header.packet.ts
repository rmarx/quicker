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

    toBuffer(connection: Connection): Buffer {
        throw new Error("Method not implemented.");
    }

}
import {BasePacket} from '../base.packet';
import {Connection} from '../../quicker/connection';



export class ShortHeaderPacket extends BasePacket {


    
    toBuffer(connection: Connection): Buffer {
        throw new Error("Method not implemented.");
    }

}
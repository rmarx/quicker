import {PacketLogging} from './packet.logging';
import {Constants} from '../constants';
import { Logger, configure, getLogger } from 'log4js';


export class VerboseLogging{
    private static logger: VerboseLogging;
    private output: Logger;

    public static getInstance(): VerboseLogging {
        if (this.logger === undefined) {
            this.logger = new VerboseLogging();
        }
        return this.logger;
    }


    private constructor() {
        this.output = getLogger();
        this.output.level = Constants.LOG_LEVEL;
    }
    
    public logMethod(message: string): void {
        this.output.debug(message);
    }
}
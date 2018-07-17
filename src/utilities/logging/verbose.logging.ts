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

    public static trace(message:string){
        VerboseLogging.getInstance().output.trace(message);
    }

    public static debug(message:string){
        VerboseLogging.getInstance().output.debug(message);
    }

    public static info(message:string){
        VerboseLogging.getInstance().output.info(message);
    }

    public static warn(message:string){
        VerboseLogging.getInstance().output.warn(message);
    }

    public static error(message:string){
        VerboseLogging.getInstance().output.error(message);
    }

    public static fatal(message:string){
        VerboseLogging.getInstance().output.fatal(message);
    }

    public static getLogLevel():string {
        return (VerboseLogging.getInstance().output.level as any).levelStr.toLowerCase();
    }

    private constructor() {
        this.output = getLogger();
        this.output.level = Constants.LOG_LEVEL;
    }
    
    public logMethod(message: string): void { 
        this.output.debug(message);
    }
}

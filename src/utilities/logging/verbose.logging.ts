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

    public static getInternalLogger():Logger {
        return VerboseLogging.getInstance().output;
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
        let config = {
            appenders: {
                consoleOut: {
                    type: Constants.LOG_TYPE
                },
                fileOut: {
                    type: "file",
                    filename: './logs/' + Constants.LOG_FILE_NAME, // TODO: allow logging to a file per ConnectionID for easier online debugging 
                    maxLogSize: Constants.MAX_LOG_FILE_SIZE,
                    layout: { type: 'basic' } /*{
                        type: 'pattern',
                        pattern: '%d %m' // don't want colors in our files 
                    }
                    */
                },

                qlogConsole: {
                    type: Constants.LOG_TYPE,
                    layout: {
                        type: "pattern",
                        pattern: "%[[%d] [%p] %c [%X{connectionID}] -%] %m%n" // basically the same as 'basic' but with connectionID added
                    }
                },
                // https://github.com/log4js-node/log4js-node/blob/master/docs/multiFile.md
                qlogMultifile: { // see qlog.wrapper.ts for actual usage. Can only have 1 log4js instance, so have to add this here 
                    type: "multiFile",
                    base: './logs/',
                    extension: ".qlog",
                    property: "ID", // see QlogWrapper:ctor
                    maxLogSize: Constants.MAX_LOG_FILE_SIZE,
                    flags: "w", // do not append but overwrite a file if it exists already
                    layout: {
                        type: 'pattern',
                        pattern: '%m' // qlog is its own format, just want to keep that, no log4js magic otherwise 
                    }
                }
            },
            categories: {
                default: {
                    appenders: ['fileOut'],
                    level: Constants.LOG_LEVEL
                },
                qlog: {
                    appenders: ['qlogConsole', 'qlogMultifile'],
                    level: Constants.LOG_LEVEL
                }
            }
        };

        if( !process.env.DISABLE_STDOUT || (process.env.DISABLE_STDOUT === "false") )
            config.categories.default.appenders.push('consoleOut');

        console.log("VerboseLogging: starting with log level " + Constants.LOG_LEVEL);

        configure(config);

        this.output = getLogger();
        this.output.level = Constants.LOG_LEVEL;
    }
    
    public logMethod(message: string): void { 
        this.output.debug(message);
    }
}

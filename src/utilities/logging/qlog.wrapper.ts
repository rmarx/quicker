import { Logger, getLogger } from 'log4js';
import {Constants} from '../constants';
import { VerboseLogging } from './verbose.logging';

/*
Example usage: 

let wrapper1:QlogWrapper = new QlogWrapper("ConnectionID_XYZ_11111", "CLIENT", "Testing qlog logging 1");
let wrapper2:QlogWrapper = new QlogWrapper("ConnectionID_XYZ_22222", "SERVER", "Testing qlog logging 2");

wrapper1.DEBUGtestLog("Entry 1");
wrapper1.DEBUGtestLog("Entry 2");
wrapper1.DEBUGtestLog("Entry 3");
wrapper1.DEBUGtestLog("Entry 4");
wrapper2.DEBUGtestLog("Separate file, shouldn't show up in file 1");

wrapper1.close();
wrapper2.close();
*/

export class QlogWrapper{

    private logger!:Logger;
    private startTime!:number;

    public constructor(connectionID:string, vantagepoint:string, description:string ) {
        
        VerboseLogging.getInstance(); // make sure VerboseLogging is created, since it initializes log4js properly 

        
        this.logger = getLogger("qlog");
        this.logger.addContext("connectionID", connectionID); // so we can split logs based on the connectionID, see VerboseLogging:ctor
        this.logger.level = Constants.LOG_LEVEL;

        this.startTime = (new Date()).getTime();

        let qlogPreamble:any = {
            qlog_version: "0.1",
            description: description,
            // simple endpoint output file has only a single connection here 
            connections: [
                {
                    vantagepoint: vantagepoint,
                    connectionid: connectionID,
                    starttime: "" + this.startTime, // json has limited precision for numbers, so wrap timestamp as a string
                    metadata: "", // TODO: potentially also fill this one in here? 
                    fields: [
                        "time",
                        "category",
                        "type",
                        "trigger",
                        "data"
                    ],
                    events: [

                    ]
                }
            ]
        };

        // we can't just write the whole pre-amble, because we want to log the "Events" in the array
        // so we need to cut off the closing brackets at the end and write them again ourselves (see :close())
        let preambleString:string = JSON.stringify(qlogPreamble, null, 4); // pretty print with 4 spaces

        // we want to slide off ]}]}
        // so we search for 2nd to last ] and use that as slice point
        let events:number = preambleString.lastIndexOf("events");
        let squareBracketIndex:number = preambleString.indexOf("]", events);
        preambleString = preambleString.slice(0, squareBracketIndex);

        this.logger.debug(preambleString);
    }

    private logToFile(evt:any[]){
        evt[0] = ((new Date()).getTime() - this.startTime); // we store the delta, which is small enough, shouldn't need a string
        this.logger.debug( "                " + JSON.stringify(evt) + ",");
    }

    public DEBUGtestLog(message:any, ...args: any[]){
        let evt:any = [
            123, // placeholder for timestamp
            "CATEGORY",
            "TYPE",
            "TRIGGER",
            { message }
        ];

        this.logToFile(evt);
    }

    public close(){
        // NOTE: log4js isn't really setup to write data when the log files are closing
        // this will lead to incomplete valid .json files (As we don't close the array of events properly)
        // calling this close() method alleviates that.
        // HOWEVER: we still need to take into account incomplete files, seeing as for a crash, this method will not be called
        // so the frontend needs to employ a streaming .json parser instead of a sync parser, which is best practice anyway
        // e.g., see http://oboejs.com 
        this.logger.debug("]}]}");
    }
}
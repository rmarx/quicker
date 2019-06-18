

import { Connection } from '../../quicker/connection';
import { EndpointType } from '../..//types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../..//packet/header/header.properties';
import { TransportParameters, TransportParameterId } from '../..//crypto/transport.parameters';
import { VerboseLogging } from '../../utilities/logging/verbose.logging';
import { exec } from 'child_process';
//import { Http3PrioritisedElementNode } from '../../http/http3/common/prioritization/http3.prioritisedelementnode';

// run directly in quicker main directory as ../node/out/Release/node ./out/tests/prioritization/test.prioritization.testcases.js 
// output files are stored in quicker/logs (can be changed in Constants.ts)
export class TestPrioritization {


    // TODO: log runtimes + save to file 
    // TODO: auto-grep log files for the correct output + typical CC errors
    // TODO: scale the deltaStartTimes based on the outputs here (and see if the resulting values are still stable!) 

    public static execute(): boolean {
        let result:boolean = false;

        let bufferSize = "0";

        // note: we now have 45  instead of 40 test cases:
        // these are new: 'syntheticmeenan','huffingtonpost','usatoday','change','syntheticwijnants'

        let testcasesSimple:Array<string> = ["gnu", "apache", "academia", "bitly", "dotdash", "github", "google", "gravatar", "opera", "syntheticmeenan", "ed", "gov_uk", "harvard", "phpbb", "statcounter", "wordpress"];
        let testcasesComplex:Array<string> = ["columbia", "etsy", "huffingtonpost", "joomla", "nature", "pinterest", "reddit", "sciencedirect", "spotify", "telegraph", "cnet", "facebook", "imdb", "wikipedia",
                                            "msn", "nytimes", "proflow-vodlib", "researchgate", "sciencemag2",  "usatoday", "w3"];

        let testcasesBroken:Array<string> = new Array<string>();
        testcasesBroken.push("change"); // javascript heap out of memory
        testcasesBroken.push("vtm");  // javascript heap out of memory
        testcasesBroken.push("youtube");  // process out of memory
        testcasesBroken.push("intel2");  // javascript heap out of memory
        testcasesBroken.push("syntheticwijnants");// API fatal error handler returned after process out of memory
        testcasesBroken.push("canvas"); // javascript heap out of memory on s+
        testcasesBroken.push("imgur"); // often times out

        let testcases = testcasesSimple.concat( testcasesComplex ).concat( testcasesBroken );//.concat(["demorgen"]); // for some reason does the "demorgen" testcase often timeout, leading to errors for the ones directly behind: keep it at the back 
                                                                                                                   // this helps: kill -9 `ps aux | grep demorgen | grep -v grep | awk '{print $2}'`

        // in the final results, we did not re-run the "demorgen" testcases due to lack of time                                                                                                                

        // the "zeroweightsimple" scheme is in a separate branch : http3-20_0-weight, since it changes http/3's default behaviour, which conflicts with all the rest
        let schemes:Array<string> = ["fifo", "rr", "wrr", "dfifo", "firefox", "p+", "s+", "pmeenan", "pmeenanhtml", "spdyrr"/*, "zeroweightsimple"*/];
        //bufferSize = "280k"; // define buffer size in democlient.ts with the sendbuffer.patch file applied // 2000 is 280k, 7200 is 1000k



        let goodTestCount = 0;
        let currentTestcaseIndex = 0;
        let currentSchemeIndex = 0;

        let succeededCases:Array<any> = new Array<any>();
        let failedCases:Array<any> = new Array<any>();

        let getNextScheme = () => {
            let output = undefined;
            
            ++currentSchemeIndex;
            
            if( currentSchemeIndex < schemes.length ){
                output = schemes[currentSchemeIndex];
            }

            return output;
        };

        let getCurrentScheme = () => {
            return schemes[currentSchemeIndex];
        };


        let getNextTestcase = () => {
            let output = undefined;
            if( currentTestcaseIndex < testcases.length ){
                output = testcases[currentTestcaseIndex];
            }
            
            ++currentTestcaseIndex;

            return output;
        };

        let processNextTestcase = function():void{
            let startTime = Date.now();

            // we want to iterate over schemes first, then per scheme all test cases
            // so we only want to select the next scheme if we run out of test cases 
            let currentScheme:string = getCurrentScheme();
            let nextTestcase:string|undefined = getNextTestcase();

            console.log("processNextTestcase : ", currentScheme, nextTestcase);

            if( nextTestcase === undefined ){
                let nextScheme = getNextScheme();

                if( nextScheme === undefined ){
                    // all done, no more URLS to download!
                    VerboseLogging.info(`TestPrioritization: Done processing ${schemes.length} schemes for ${testcases.length} testcases, ${goodTestCount} succeeded`);
                    console.log(`TestPrioritization: Done processing ${schemes.length} schemes for ${testcases.length} testcases, ${goodTestCount} succeeded`);

                    console.log("Succeeded cases : ", succeededCases.length, JSON.stringify(succeededCases, null, 4) );
                    console.log("Failed cases: ", failedCases.length, JSON.stringify(failedCases, null, 4) );

                    //console.log("CHUNK_SIZE was ", Http3PrioritisedElementNode.CHUNK_SIZE);

                    process.exit(0);
                    return;
                }
                else{
                    console.log(`All done for current scheme ${currentScheme}, moving to the next ${nextScheme}`);

                    console.log("Current Succeeded cases : ", succeededCases);
                    console.log("Current Failed cases: ", failedCases);

                    // scheme has been moved to the next one, we restart with the test cases for this scheme 
                    currentTestcaseIndex = 0;
                    nextTestcase = getNextTestcase();

                    currentScheme = nextScheme;
                }
            }

            let currentTestcase:string = nextTestcase as string; 

            let serverDone:boolean = false;
            let clientDone:boolean = false;
            let serverError:boolean = false;
            let clientError:boolean = false;

            VerboseLogging.info(`Processing ${currentTestcase}, ${succeededCases.length + failedCases.length + 1} out of ${ schemes.length * testcases.length} to run.`); 

            
            // run this in main quicker directory, e.g., ../node/out/Release/node ./out/test/prioritization/test.prioritization.testcases.ts
            let nodeLocation:string = "LOG_LEVEL=warn DISABLE_STDOUT=true ../node/out/Release/node --max-old-space-size=8192"; // we got javascript heap out of memory errors with the default limits: allow up to 8GB now, should fix things 

            let onProcessExit = () => {
                if( serverDone && clientDone ){
                    let endTime = Date.now();

                    if( !serverError && !clientError ){
                        ++goodTestCount;
                        succeededCases.push( { name: currentTestcase + "_" + currentScheme, duration: (endTime - startTime) } );
                    }
                    else{
                        failedCases.push( { name: currentTestcase + "_" + currentScheme, duration: (endTime - startTime) } );
                    }

                    console.log("Testcase finished : ", currentTestcase, currentScheme, (endTime - startTime));

                    clearTimeout(timer);
                    setTimeout( () => { processNextTestcase(); }, 5000 );
                }
            };

            let timeoutHappened:boolean = false;
            let timer = setTimeout( function(){ 
                timeoutHappened = true;
                console.log("|||||||||||||||||||||||||||||||||||||||||||||");
                console.log("TestPrioritization : timeout happened, starting next", currentTestcase);
                console.log("|||||||||||||||||||||||||||||||||||||||||||||");

                serverDone = true;
                clientDone = true;
                serverError = true;
                clientError = true;

                onProcessExit();
            }, 300000 ); // if not done after 5 minutes, we're just going to consider the wget call to hang and move on

            // the testcase files should be put under quicker/public/prioritization_testcases/ (we made 'prioritization_testcases' a symlink)

            console.log("Starting server ", currentTestcase, currentScheme);
            let bufferSizeAppendage = bufferSize === "0" ? "" : "_" + bufferSize; // 0 buffersize doesn't reflect in the filename because we were to stupid to take it into account from the start 
            let serverLogFilename:string = `${currentTestcase}_${currentScheme}${bufferSizeAppendage}_server_1.log`;
            let serverQLogFilename:string = `${currentTestcase}_${currentScheme}${bufferSizeAppendage}_server_1`;
            //./out/http/http3/server/demoserver.js $1 $2_$1_server_1 $2_$1_server_1.log prioritization_testcases/$2
            exec( nodeLocation + ` ./out/http/http3/server/demoserver.js ${currentScheme} ${serverQLogFilename} ${serverLogFilename} prioritization_testcases/${currentTestcase} public/prioritization_testcases/${currentTestcase}/prioritization_resource_lists/resource_list.json`, { encoding: "buffer", maxBuffer: 4048 * 10240 }, function(error, {}, stderr){
                serverDone = true;
                console.log("Server exited ", currentTestcase, currentScheme, timeoutHappened);
                
                if( timeoutHappened )
                    return;

                if( error && (error as any).code !== 66 ){ // 66 is hardcoded signal for success
                    serverError = true;
                    console.log("-----------------------------------------");    
                    console.log("TestPrioritization : ERROR SERVER : ", (error as any).code, error, stderr, currentTestcase, currentScheme);
                    console.log("-----------------------------------------");

                    // no sense in waiting for the client anymore
                    timeoutHappened = true;
                    clientError = true;
                    clientDone = true;
                }
                
                onProcessExit();
            });

            console.log("Starting client ", currentTestcase, currentScheme);
            let clientLogFilename:string = `${currentTestcase}_${currentScheme}${bufferSizeAppendage}_client_1.log`;
            let clientQLogFilename:string = `${currentTestcase}_${currentScheme}${bufferSizeAppendage}_client_1`;
            setTimeout( () => {
                //./out/http/http3/client/democlient.js $2_$1_client_1 $2_$1_client_1.log public/prioritization_testcases/$2/prioritization_resource_lists/resource_list.json
                exec( nodeLocation + ` ./out/http/http3/client/democlient.js ${clientQLogFilename} ${clientLogFilename} public/prioritization_testcases/${currentTestcase}/prioritization_resource_lists/resource_list.json`,{ encoding: "buffer", maxBuffer: 4048 * 10240  }, function(error, {}, stderr){
                    clientDone = true;
                    console.log("Client exited ", currentTestcase, currentScheme, timeoutHappened);

                    if( timeoutHappened )
                        return;

                    if( error && (error as any).code !== 66 ){ // 66 is hardcoded signal for success 
                        clientError = true;
                        console.log("-----------------------------------------");    
                        console.log("TestPrioritization : ERROR CLIENT : ", (error as any).code, error, stderr, currentTestcase, currentScheme);
                        console.log("-----------------------------------------");

                        // no sense in waiting for the server anymore
                        // however, we cannot close the server process here yet, so we have no option but to wait for the timeout
                        // the server process needs to close, because it hogs the 4433 network port. We don't have that problem for clients. 
                    }
                    
                    onProcessExit();
                });
            }, 1000); // give server some time to start
        };

        processNextTestcase();
        
        return true;
    }
}

TestPrioritization.execute();

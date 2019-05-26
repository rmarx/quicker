import { Stream, StreamEvent } from "../quicker/stream";
import { EndpointType } from "../types/endpoint.type";
import { Constants } from "../utilities/constants";
import { Bignum } from "../types/bignum";
import { createHash } from "crypto";
import { VerboseLogging } from "../utilities/logging/verbose.logging";


export class TestStreamBuffering  {

    public static successfullTestcaseCount = 0;

    public static runTestCase( nr:number, testCaseFunction:(nr:number, stream:Stream, inputData:Buffer) => void ){
        let inputData = Buffer.from("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc non mollis ex. Quisque lacinia dui at ultrices mollis. Fusce non sem molestie, imperdiet magna non, tempor est. Ut dapibus suscipit ante sit amet elementum. Aliquam tristique aliquet congue. Vestibulum mollis massa eu neque euismod, id dictum metus volutpat. Etiam imperdiet vitae lectus volutpat pretium. Fusce ac pharetra elit. Sed eget cursus lacus. Morbi ac erat erat.Duis interdum libero est, et eleifend nulla consequat efficitur. Nunc egestas blandit elit id tristique. Maecenas non ligula ac est elementum euismod ac eleifend diam. In lacus ex, tristique eget iaculis eu, fermentum quis sapien. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque libero magna, hendrerit quis porttitor nec, aliquet et metus. Nam pulvinar et ligula id pellentesque. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Pellentesque aliquet sodales ligula porta maximus. Sed pharetra, erat vel iaculis efficitur, leo erat dapibus nunc, non elementum eros dolor eget erat.Nunc lorem mi, dictum a aliquet sollicitudin, lobortis a metus. Nunc faucibus purus in enim venenatis tempus. Pellentesque sed dictum dui. Pellentesque semper enim vitae semper egestas. Nullam ornare sapien ut blandit pharetra. Vivamus fringilla blandit posuere. Quisque quis turpis pretium odio elementum laoreet vitae sed sem. Cras vitae tempus mi. Integer nec risus nisi. Phasellus nisl libero, malesuada sit amet sagittis eget, tristique id diam. Vestibulum pulvinar, nulla et accumsan tempor, ex nisi dictum eros, eu tincidunt libero est ac lectus. Mauris tempus, turpis non rutrum pulvinar, lectus tellus interdum urna, vel lobortis dolor orci nec nunc. Quisque consectetur enim at pulvinar interdum. Pellentesque iaculis ullamcorper est, quis pretium tortor volutpat ut. Curabitur lacus tellus, vulputate at ex ac, commodo venenatis turpis.Duis ornare quis metus vitae dignissim. Aenean magna massa, ultricies a molestie sed, porta in dui. Nam malesuada nunc nulla, vel dictum tellus egestas sit amet. Maecenas pretium nunc nisi, ac vehicula diam varius at. Nulla lectus nisl, tristique sed enim non, auctor venenatis est. Integer eu libero sapien. Sed ut nunc facilisis, suscipit urna vel, tincidunt nibh. Phasellus eget molestie lectus. Sed consequat suscipit lectus et congue.Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed tempus at dolor sed mattis. Quisque efficitur lacinia ipsum sollicitudin placerat. Proin bibendum varius urna ut molestie. Nam dapibus nisi eget libero porta imperdiet. Nunc ligula dui, lobortis sollicitudin augue ut, aliquet imperdiet velit. Suspendisse at enim odio. Aliquam enim tortor, maximus at lacus vitae, blandit condimentum nisi.Suspendisse nisl mauris, placerat quis augue at, sodales pretium justo. Vestibulum fermentum, augue a ultricies fermentum, ligula neque tincidunt est, id porta lorem nibh at ligula. Phasellus at turpis sagittis orci fringilla pulvinar. Nulla eget venenatis risus. Ut est purus, suscipit at nunc egestas, tempor placerat tortor. Morbi eget dui pharetra, tempor lacus eu, aliquet eros. Nulla pellentesque ante leo, eu aliquam leo mattis sit amet. Vivamus ultricies dui ut lorem vestibulum, ut mollis turpis tristique. Nullam tempor, quam non ullamcorper venenatis, nisl ante hendrerit arcu, a viverra nisl nisl et sapien. Morbi sit amet augue suscipit, mollis nunc ac, egestas metus. Suspendisse tortor est, eleifend vel sem ut, viverra ultricies nibh. Mauris molestie, odio ut dignissim iaculis, nulla leo convallis nulla, non vehicula mauris sem non sem. Fusce sollicitudin tempor nunc, non pellentesque ligula tincidunt eget. Quisque sit amet accumsan ante. Nam vitae commodo augue, consequat maximus quam. In auctor libero metus, sit amet ultrices neque condimentum vel.Cras commodo a felis sed vulputate. Suspendisse suscipit pulvinar augue id auctor. Proin sed lacus venenatis lorem rutrum feugiat at vel sapien. Phasellus ac tempus augue. Donec in augue ac mauris eleifend ultrices sed non sapien. Pellentesque vel dolor aliquet, dapibus mi eu, maximus nisl. Nam tellus nibh, vulputate a urna vel, venenatis auctor risus. Donec pulvinar, mauris et finibus efficitur, velit ante euismod magna, vel tempus arcu est at lorem.Maecenas bibendum, ante sed imperdiet pulvinar, turpis velit ultrices magna, non tincidunt arcu ipsum sed ante. Morbi et sodales quam. Aliquam interdum dolor ut ipsum sollicitudin, non placerat augue faucibus. Morbi blandit dui nec eros cursus interdum. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Etiam gravida pharetra blandit. Vivamus fermentum consequat mattis. Praesent varius vitae est sed congue. Etiam purus erat, iaculis mattis metus vel, lobortis porttitor urna. Curabitur varius semper aliquet. Sed nec eros efficitur, lacinia dolor rutrum, volutpat magna. Nullam metus purus, molestie nec quam eu, elementum iaculis risus. Nullam pulvinar libero et imperdiet molestie. Nam egestas molestie felis vel dignissim. Vestibulum egestas euismod risus eget condimentum.Curabitur sed turpis a mauris rhoncus lobortis. Nulla consequat orci in tellus rhoncus maximus. Mauris sagittis non purus et tristique. Interdum et malesuada fames ac ante ipsum primis in faucibus. Integer euismod interdum tristique. Sed bibendum pretium porta. Etiam sed interdum nisl, eget ornare diam. Fusce consequat orci bibendum diam convallis volutpat in finibus enim. Pellentesque euismod tristique urna quis pharetra. Aenean sodales, justo eu ultricies viverra, lacus lorem ullamcorper eros, nec feugiat ipsum massa gravida dui. Fusce dictum leo at tellus dignissim, nec ullamcorper ligula faucibus. Nullam et ex odio.Sed vitae rhoncus velit, vitae cursus enim. Aliquam fringilla elit fringilla sapien aliquam, quis luctus neque bibendum. Nullam non enim non tellus aliquam ullamcorper in id velit. Sed id neque a lacus lacinia porta. Duis eget tempus metus. Morbi aliquet pretium massa, nec vehicula arcu tempus id. Donec in est nec ex sollicitudin mattis. Duis eget facilisis elit, vitae sodales dui. Duis mattis nisl arcu, ac scelerisque mauris congue non. Etiam eros lacus, vulputate vitae arcu vitae, cursus viverra turpis. Integer maximus nisl vel porta vestibulum. Cras a purus sed quam aliquet cursus sit amet sit amet enim. Quisque vitae dignissim elit, vitae varius magna. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Maecenas tincidunt a arcu quis posuere. Nullam iaculis porttitor felis, quis sagittis libero rhoncus a. Aliquam lacinia iaculis neque. Sed efficitur.", "utf8");

        let inputHash = createHash('md5').update(inputData).digest("hex");

        let outputData = "";
        let stream:Stream = new Stream(EndpointType.Server, new Bignum(666));

        VerboseLogging.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Testcase " + nr + " START");

        stream.on( StreamEvent.DATA, (data:Buffer) => {
            //console.log( data.toString("utf8") );
            VerboseLogging.trace("Testcase " + nr + " : DATA : " + data.byteLength);
            outputData += data.toString("utf8");
        });

        stream.on( StreamEvent.END, () => {
            let outputHash = createHash('md5').update(outputData).digest("hex");
            if( (outputHash === inputHash) ){
                VerboseLogging.info(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Testcase " + nr + " : STREAM END : " + (outputHash === inputHash) + " ? " + outputHash + " ?== " + inputHash );
                TestStreamBuffering.successfullTestcaseCount += 1;
            }
            else
                VerboseLogging.error(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Testcase " + nr + " : STREAM END : " + (outputHash === inputHash) + " ? " + outputHash + " ?== " + inputHash );
        });

        testCaseFunction( nr, stream, inputData );
    }

    public static execute(): boolean {

        Constants.LOG_LEVEL = "trace";
        
        // normal case
        TestStreamBuffering.runTestCase( 1, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        });

        // simple out-of-order
        TestStreamBuffering.runTestCase( 2, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
        });

        // retransmit, full overlap, simple
        TestStreamBuffering.runTestCase( 3, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 4, inputData.length / 2 ), new Bignum(inputData.length / 4), false );
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        });

        // retransmit, full overlap, 2
        TestStreamBuffering.runTestCase( 4, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 4, inputData.length / 3 ), new Bignum(inputData.length / 4), false );
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        });

        // retransmit, partial overlap, 1
        TestStreamBuffering.runTestCase( 5, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 4, inputData.length * 0.75 ), new Bignum(inputData.length / 4), false );
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        });

        // retransmit, partial overlap, 2
        TestStreamBuffering.runTestCase( 6, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 4, inputData.length * 0.70 ), new Bignum(inputData.length / 4), false );
            stream.receiveData( inputData.slice( inputData.length / 2, inputData.length - 10 ), new Bignum(inputData.length / 2), false );
            stream.receiveData( inputData.slice( inputData.length / 4 ), new Bignum(inputData.length / 4), true );
        });

        // retransmit, overlap, failure expected
        TestStreamBuffering.runTestCase( 7, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 4, inputData.length * 0.75 ), new Bignum(inputData.length / 4), false );
            VerboseLogging.error("mental health check about to be sent : this test is intended to fail");
            stream.receiveData( Buffer.from("MENTAL HEALTH CHECK, SHOULD FAIL", "utf8"), new Bignum(inputData.length * 0.75), false );
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        });

        // retransmit, overlap, failure NOT expected despite bogus data: later received data is used first, makes bad data obsolete
        TestStreamBuffering.runTestCase( 8, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 4, inputData.length * 0.75 ), new Bignum(inputData.length / 4), false );
            stream.receiveData( Buffer.from("MENTAL HEALTH CHECK, BUT SHOULD NOT FAIL", "utf8"), new Bignum(inputData.length * 0.75 + 1), false );
            stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        });
        

        // full on stress test
        TestStreamBuffering.runTestCase( 9, (nr:number, stream:Stream, inputData:Buffer) => {
            // generate up to 250 semi-random sequences and then add the final bytes as Fins
            // this *SHOULD* end, but of course can also fail to... 
            let currentOffset:Bignum = new Bignum(0);

            for( let i = 0; i < 250; ++i ){
                if( (inputData.byteLength - currentOffset.toNumber()) < 10 ){
                    break;
                }

                let length = Math.max(1, Math.floor(Math.random() * ((inputData.byteLength - currentOffset.toNumber()) * 0.10))); //Bignum.random( (remainingLength * 0.10).toString(16) ); // max 20% of the remaining possible data

                let coinToss =  Math.random();
                if( i === 0 || coinToss < 0.1 ){
                    // normal
                    stream.receiveData( inputData.slice(currentOffset.toNumber(), currentOffset.toNumber() + length), currentOffset, false );

                    currentOffset = currentOffset.add( length );
                }
                else if( coinToss < 0.3 ){
                    // future buffered datas
                    let future = Math.floor(Math.random() * 10);
                    stream.receiveData( inputData.slice(currentOffset.toNumber() + future, currentOffset.toNumber() + future + length), currentOffset.add(future), false );
                }
                else if( coinToss < 0.8 ){
                    // partial overlap
                    let shift = Math.floor(Math.random() * 20);
                    stream.receiveData( inputData.slice(currentOffset.toNumber() - shift, currentOffset.toNumber() - shift + length), currentOffset.subtract(shift), false );

                    currentOffset = new Bignum( currentOffset.toNumber() -shift + length - 1 );
                }
                else {
                    // full overlap
                    let shift = Math.floor(Math.random() * 10);
                    stream.receiveData( inputData.slice(currentOffset.toNumber() - shift - length, currentOffset.toNumber() -shift), currentOffset.subtract(shift).subtract(length), false );
                }


            }

            stream.receiveData( inputData.slice( currentOffset.toNumber() - 20 ), new Bignum(currentOffset.toNumber() - 20), true );
        });

        // pending data, should never END
        TestStreamBuffering.runTestCase( 10, (nr:number, stream:Stream, inputData:Buffer) => {
            stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
            stream.receiveData( inputData.slice( inputData.length / 2 + 1 ), new Bignum(inputData.length / 2 + 1), true );
        });


        console.log("All happy path testcases passed? " + (TestStreamBuffering.successfullTestcaseCount === 8) + " = " + TestStreamBuffering.successfullTestcaseCount );

        //stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );
        //stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );


        //stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        //stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );

        //stream.receiveData( inputData.slice( inputData.length / 2 ), new Bignum(inputData.length / 2), true );
        //stream.receiveData( inputData.slice( 0, inputData.length / 2 ), new Bignum(0), false );


        // need to test 4 scenarios
        // 1. normal : perfectly ordered data transfer
        // 2. too far ahead : data needs to be buffered
        // 3. duplicated data : discard because already processed
        // 4. partially duplicated data : discard duplicated part, process the rest 


        return true;
    }
}

TestStreamBuffering.execute();
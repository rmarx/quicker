import { TestHttp3Frameparser } from "./http3.frameparsing.test";
import { Http3StreamPriorityTester } from "./http3.streampriorities.test";
import { AssertionError } from "assert";

let testCount = 0;

if (TestHttp3Frameparser.execute() === false) {
    throw new AssertionError({
        message: "HTTP/3 frame parser test failed"
    });
}
++testCount;
// if (Http3StreamPriorityTester.execute() === false) {
//     throw new AssertionError({
//         message: "Stream prioritization test failed"
//     });
// }
// ++testCount;

console.info("All HTTP/3 test suite(s) succeeded");
console.info(testCount + " test suites ran");

import { TestHttp3Frameparser } from "./http3.frameparsing.test";
import { AssertionError } from "assert";

let testCount = 0;

if (TestHttp3Frameparser.execute() === false) {
    throw new AssertionError({
        message: "HTTP/3 frame parser test failed"
    });
}
++testCount;

console.info("All HTTP/3 test suite(s) succeeded");
console.info(testCount + " test suites ran");

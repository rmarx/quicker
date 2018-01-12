import { VerboseLogging } from "./../logging/verbose.logging";
import { ConsoleColor } from "./../logging/colors";
import { Constants } from "./../constants";

/**
 * Inspired by https://github.com/dormd/rich-logger-decorator
 */

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;

export function logMethod() {
    return function (target: Object, methodName: string, descriptor: TypedPropertyDescriptor<any>) {
        var logger = VerboseLogging.getInstance();
        const originalMethod = descriptor.value; 

        descriptor.value = function (...args: any[]) {
            logger.logMethod(ConsoleColor.FgGreen + ConsoleColor.Bright + "Calling method: " +  methodName + ConsoleColor.Reset);
            // print arguments
            logger.logMethod(ConsoleColor.Bright + "\targuments: " + ConsoleColor.Reset);
            var argumentStrings = getArguments(args, originalMethod);
            argumentStrings.forEach((arg: string) => {
                logger.logMethod("\t\t" + arg);
            });
            // run and store result
            const result = originalMethod.apply(this, args);
            // print return values
            logger.logMethod(ConsoleColor.Bright + "\t returns: " + ConsoleColor.Reset);

            // TODO: still need to change this to look similar as getArguments function
            if (result instanceof Buffer && result.byteLength > 64) {
                logger.logMethod("\t\t type: Buffer, value: [Log large buffer data disabled]");
            } else {
                logger.logMethod("\t\t" + JSON.stringify(result));
            }
            // return the result of the original method
            return result;
        };

        return descriptor;
    }
}

function getArguments(argValues: any[], func: Function): string[] {
    const fnStr = func.toString().replace(STRIP_COMMENTS, '');
    let argNames: string[] | null = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (argNames === null) {
        argNames = [];
    }

    const requiredArgNames: string[] = argNames;

    return requiredArgNames.map(function (argName: string): string {
        var argNameIndex = requiredArgNames.indexOf(argName);
        var value = argValues[argNameIndex];
        if (value instanceof Buffer) {
            var strValue = value.toString('hex');
            if (Constants.LOG_LARGE_BUFFER_DATA || value.byteLength < 64) {
                return `${ConsoleColor.Underscore}[${requiredArgNames[argNameIndex]}${ConsoleColor.Reset}=0x${strValue}]`
            } else {
                return `${ConsoleColor.Underscore}[${requiredArgNames[argNameIndex]}${ConsoleColor.Reset}=[Log large buffer data disabled]`
            }
        }
        return `${ConsoleColor.Underscore}[${requiredArgNames[argNameIndex]}${ConsoleColor.Reset}=${value}]`
    });
};
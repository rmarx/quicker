import { VerboseLogging } from "./../logging/verbose.logging";
import { ConsoleColor } from "./../logging/colors";

/**
 * Inspired by https://github.com/dormd/rich-logger-decorator
 */

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;

export function logMethod() {
    return function (target: Object, methodName: string, descriptor: TypedPropertyDescriptor<any>) {
        var logger = VerboseLogging.getInstance();
        const originalMethod = descriptor.value; // save a reference to the original method

        descriptor.value = function (...args: any[]) {
            logger.logMethod(ConsoleColor.FgGreen + ConsoleColor.Bright + "Calling method: " +  methodName + ConsoleColor.Reset);
            // pre
            logger.logMethod(ConsoleColor.Bright + "\targuments: " + ConsoleColor.Reset);
            var argumentStrings = getArguments(args, originalMethod);
            argumentStrings.forEach((arg: string) => {
                logger.logMethod("\t\t" + arg);
            });
            // run and store result
            const result = originalMethod.apply(this, args);
            // post
            logger.logMethod(ConsoleColor.Bright + "\t returns: " + ConsoleColor.Reset);
            logger.logMethod("\t\t" + JSON.stringify(result));
            // return the result of the original method (or modify it before returning)
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
            value = value.toString('hex');
            return `${ConsoleColor.Underscore}[${requiredArgNames[argNameIndex]}${ConsoleColor.Reset}=0x${value}]`
        }
        return `${ConsoleColor.Underscore}[${requiredArgNames[argNameIndex]}${ConsoleColor.Reset}=${value}]`
    });
};
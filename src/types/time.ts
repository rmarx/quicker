import { Bignum } from "./bignum";


export class Time {

    private timeTuple: [number, number];

    private constructor(timeTuple: [number, number]) {
        this.timeTuple = timeTuple;
    }

    public format(format: TimeFormat) {
        var secondsFormat = 1e12;
        var nanoFormat = 1;
        switch (format) {
            case TimeFormat.MicroSeconds:
                secondsFormat = 1e6;
                nanoFormat = 1e3;
                break;
            case TimeFormat.MilliSeconds:
                secondsFormat = 1e3;
                nanoFormat = 1e6;
                break;
            case TimeFormat.Seconds:
                secondsFormat = 1;
                nanoFormat = 1e9;
                break;
        }
        return (this.timeTuple[0] * secondsFormat + this.timeTuple[1]) / nanoFormat;
    }

    public static now(diffTime?: Time): Time {
        if (diffTime === undefined) {
            var hr = process.hrtime();
        } else {
            var hr = process.hrtime(diffTime.timeTuple);
        }
        return new Time(hr);
    }
}

export enum TimeFormat {
    NanoSeconds,
    MicroSeconds, 
    MilliSeconds,
    Seconds
}


export class Time {

    public static now(format: TimeFormat): number {
        var hr = process.hrtime();
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
        return (hr[0] * secondsFormat + hr[1]) / nanoFormat;
    }
}

export enum TimeFormat {
    NanoSeconds,
    MicroSeconds, 
    MilliSeconds,
    Seconds
}
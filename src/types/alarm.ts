import { EventEmitter } from "events";
import { clearTimeout } from "timers";


export class Alarm extends EventEmitter {

    private timer!: NodeJS.Timer;
    private running: boolean;
    private duration:number;

    public constructor() {
        super();
        this.running = false;
        this.duration = 0;
    }

    public reset() {
        clearTimeout(this.timer);
        this.removeAllListeners();
        this.running = false;
    }

    public start(timeInMs: number) {
        this.running = true;
        this.duration = timeInMs;
        this.timer = global.setTimeout(() => {
            this.onTimeout(this.duration);
        }, this.duration);
    }

    private onTimeout(timePassed:number) {
        this.running = false;
        this.emit(AlarmEvent.TIMEOUT, timePassed);
    }

    public isRunning(): boolean {
        return this.running;
    }

    public getDuration(): number{
        return this.duration;
    }
}

export enum AlarmEvent {
    TIMEOUT = "alarm-timeout"
}
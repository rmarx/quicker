import { EventEmitter } from "events";
import { clearTimeout } from "timers";
import { EventConstants } from "./event.constants";


export class Alarm extends EventEmitter {

    private timer!: NodeJS.Timer;
    private running: boolean;

    public constructor() {
        super();
        this.running = false;
    }

    public reset() {
        clearTimeout(this.timer);
        this.removeAllListeners();
        this.running = false;
    }

    public start(timeInMs: number) {
        this.running = true;
        this.timer = global.setTimeout(() => {
            this.onTimeout();
        }, timeInMs);
    }

    private onTimeout() {
        this.running = false;
        this.emit(EventConstants.ALARM_TIMEOUT);
    }

    public isRunning(): boolean {
        return this.running;
    }
}
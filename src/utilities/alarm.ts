import { EventEmitter } from "events";
import { clearTimeout } from "timers";


export class Alarm extends EventEmitter {

    private timer: NodeJS.Timer;
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

    public set(timeInMs: number) {
        this.running = true;
        this.timer = global.setTimeout(() => {
            this.onTimeout();
        }, timeInMs);
    }

    private onTimeout() {
        this.running = false;
        this.emit("timeout");
    }

    public isRunning(): boolean {
        return this.running;
    }
}
import { EventEmitter } from "events";
import { clearTimeout } from "timers";


export class Alarm extends EventEmitter {

    private timer: NodeJS.Timer;

    public reset() {
        clearTimeout(this.timer);
    }

    public cancel() {
        this.reset();
    }

    public set(timeInMs: number) {
        this.timer = global.setTimeout(() => {
            this.onTimeout();
        }, timeInMs);
    }

    private onTimeout() {
        console.log("timeout event emitted");
        this.emit("timeout");
    }
}
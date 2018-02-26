
export class BaseError extends Error {
    constructor(msg?: string) {
        super(msg);
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(msg)).stack;
        }
    }
}
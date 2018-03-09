import { BaseError } from "./base.error";


/**
 * Custom errors for Quicker specific things
 */
export class QuickerError extends BaseError {

    private errorCode: number;

    constructor (errorCode: number) {
        super();
        this.errorCode = errorCode;
    }

    public getErrorCode(): number {
        return this.errorCode;
    }
}
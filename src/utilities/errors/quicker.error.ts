import { BaseError } from "./base.error";
import { QuickerErrorCodes } from "./quicker.codes";


/**
 * Custom errors for Quicker specific things
 */
export class QuickerError extends BaseError {

    private errorCode: QuickerErrorCodes;

    constructor (errorCode: QuickerErrorCodes, msg?: string) {
        super( "" + QuickerErrorCodes[errorCode] + " : " + msg);
        this.errorCode = errorCode;
    }

    public getErrorCode(): number {
        return this.errorCode;
    }
}
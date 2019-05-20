import { BaseError } from "../../../../../utilities/errors/base.error";

export enum LSQpackBindingErrorCode {
    // Custom errors
    MAX_ENCODERS_REACHED,
    MAX_DECODERS_REACHED,
}

/**
 * Custom errors for errors within lsqpack bindings
 */
export class LSQPackBindingError extends BaseError {
    private errorCode: LSQpackBindingErrorCode;

    constructor(errorCode: LSQpackBindingErrorCode, msg?: string) {
        super("" + LSQpackBindingErrorCode[errorCode] + " : " + msg);
        this.errorCode = errorCode;
    }

    public getErrorCode(): number {
        return this.errorCode;
    }
}

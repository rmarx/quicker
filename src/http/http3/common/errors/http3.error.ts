import { BaseError } from "../../../../utilities/errors/base.error";

export enum Http3ErrorCode {
    HTTP3_MALFORMED_FRAME,
    HTTP3_UNKNOWN_FRAMETYPE,
}

/**
 * Custom errors for HTTP/3 specific things
 */
export class Http3Error extends BaseError {
    private errorCode: Http3ErrorCode;

    constructor(errorCode: Http3ErrorCode, msg?: string) {
        super("" + Http3ErrorCode[errorCode] + " : " + msg);
        this.errorCode = errorCode;
    }

    public getErrorCode(): number {
        return this.errorCode;
    }
}

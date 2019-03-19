import { BaseError } from "../../../../utilities/errors/base.error";

// TODO Temporary: errors prepended with "HTTP3" are not official errors stated in the RFC.
// Replace them as much as possible with official errors
export enum Http3ErrorCode {
    HTTP3_MALFORMED_FRAME,
    HTTP3_UNKNOWN_FRAMETYPE,
    HTTP3_UNEXPECTED_FRAME,
    HTTP3_UNEXPECTED_STREAM_END,
    HTTP3_INCORRECT_STREAMTYPE,
    HTTP_WRONG_STREAM_DIRECTION,
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

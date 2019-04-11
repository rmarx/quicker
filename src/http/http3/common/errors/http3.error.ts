import { BaseError } from "../../../../utilities/errors/base.error";

// TODO Temporary: errors prepended with "HTTP3" are not official errors stated in the RFC.
// Replace them as much as possible with official errors
export enum Http3ErrorCode {
    // Custom errors
    HTTP3_MALFORMED_FRAME,
    HTTP3_UNKNOWN_FRAMETYPE,
    HTTP3_UNEXPECTED_FRAME,
    HTTP3_UNEXPECTED_STREAM_END,
    HTTP3_INCORRECT_STREAMTYPE,
    HTTP3_SERVER_CLOSED,
    HTTP3_CLIENT_CLOSED,
    HTTP3_UNINITIALISED_ENCODER,
    HTTP3_UNINITIALISED_DECODER,
    HTTP3_UNTRACKED_CONNECTION,
    HTTP3_UNKNOWN_STREAMTYPE,
    // Errors mentioned in RFC
    HTTP_WRONG_STREAM_DIRECTION,
    HTTP_UNEXPECTED_FRAME,
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

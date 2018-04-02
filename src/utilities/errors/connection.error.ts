import { BaseError } from "./base.error";
import { ConnectionErrorCodes, TlsErrorCodes, QuicErrorCode } from "./quic.codes";


export class QuicError extends BaseError {

    private errorCode: QuicErrorCode;
    private phrase: string | undefined;

    constructor (errorCode: QuicErrorCode, phrase?: string) {
        super(errorCode.toString() + ": " + phrase);
        this.errorCode = errorCode;
        this.phrase = phrase;
    }

    public getErrorCode(): QuicErrorCode {
        return this.errorCode;
    }

    public getPhrase(): string | undefined {
        return this.phrase;
    }
}
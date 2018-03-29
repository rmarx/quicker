import { BaseError } from "./base.error";
import { QuickerErrorCodes } from "./quicker.codes";


export class QuicError extends BaseError {

    private errorCode: number;
    private phrase: string | undefined;

    constructor (errorCode: number, phrase?: string) {
        super(QuickerErrorCodes[errorCode]);
        this.errorCode = errorCode;
        this.phrase = phrase;
    }

    public getErrorCode(): number {
        return this.errorCode;
    }

    public getPhrase(): string | undefined {
        return this.phrase;
    }
}
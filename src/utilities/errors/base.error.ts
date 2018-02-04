
export class BaseError {
    constructor () {
        Error.apply(this, arguments);
    }
}

BaseError.prototype = new Error();
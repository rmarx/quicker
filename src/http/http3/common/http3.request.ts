import { Http3HeaderFrame } from "./frames";

export class Http3Request {    
    private content: Buffer = new Buffer(0);
    private headers: {[property: string]: string} = {};
    
    public constructor(headers?: {[property: string]: string}) {
        if (headers !== undefined) {
            this.headers = headers;
        }
    }
    
    public toBuffer(): Buffer {
        const headerFrame: Http3HeaderFrame = new Http3HeaderFrame(this.headers);
        
        let buffer: Buffer = headerFrame.toBuffer();

        if (this.content !== undefined) {
            buffer = Buffer.concat([buffer, this.content]);
        }
        
        return buffer;
    }
    
    public getHeaderValue(headerName: string): string | undefined {
        return this.headers[headerName];
    }
    
    public setHeader(headerName: string, headerValue: string) {
        this.headers[headerName] = headerValue;
    }
    
    public setHeaders(headers: {[property: string]: string}) {
        this.headers = headers;
    }
    
    public appendContent(content: Buffer) {
        this.content = Buffer.concat([this.content, content]);
    }
    
    public setContent(content: Buffer) {
        this.content = content;
    }
}

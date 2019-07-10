import { Http3HeaderFrame, Http3DataFrame } from "./frames";
import { Http3QPackEncoder } from "./qpack/http3.qpackencoder";
import { Http3Header } from "./qpack/types/http3.header";
import { Bignum } from "../../../types/bignum";

export class Http3Request {    
    private content: Buffer = new Buffer(0);
    private headerFrame: Http3HeaderFrame;
    
    public constructor(requestStreamID: Bignum, encoder: Http3QPackEncoder, headers: Http3Header[] = []) {
        this.headerFrame = new Http3HeaderFrame(headers, requestStreamID, encoder);
    }
    
    public toBuffer(): Buffer {        
        let buffer: Buffer = this.headerFrame.toBuffer();
        buffer = Buffer.concat([buffer, this.content]);

        return buffer;
    }
    
    public getHeaderValue(property: string): string | undefined {
        return this.headerFrame.getHeaderValue(property);
    }
    
    public getHeaderFrame(): Http3HeaderFrame {
        return this.headerFrame;
    }
    
    public getDataFrame(): Http3DataFrame {
        return new Http3DataFrame(this.content);
    }
    
    public setHeader(property: string, value: string) {
        this.headerFrame.setHeaderValue(property, value);
    }
    
    public setHeaders(headers: Http3Header[]) {
        this.headerFrame.setHeaders(headers);
    }
    
    public appendContent(content: Buffer) {
        this.content = Buffer.concat([this.content, content]);
    }
    
    public setContent(content: Buffer) {
        this.content = content;
    }
}

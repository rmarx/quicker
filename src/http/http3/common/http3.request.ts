import { Http3HeaderFrame } from "./frames";

export class Http3Request {    
    private path?: string;
    private content: Buffer = new Buffer(0);
    private headers: {[property: string]: string} = {};
    
    public constructor(path?: string) {
        this.path = path;
    }
    
    public toBuffer(): Buffer {
        const headerFrame: Http3HeaderFrame = new Http3HeaderFrame(this.headers);
        
        let buffer: Buffer = headerFrame.toBuffer();

        if (this.content !== undefined) {
            buffer = Buffer.concat([buffer, this.content]);
        }
        
        return buffer;
    }
    
    public getPath(): string | undefined {
        return this.path;
    }
    
    public setPath(path: string) {
        this.path = path;
    }
    
    public appendContent(content: Buffer) {
        this.content = Buffer.concat([this.content, content]);
    }
    
    public setContent(content: Buffer) {
        this.content = content;
    }
    
    public isComplete(): boolean {
        return (this.path !== undefined);
    }
}

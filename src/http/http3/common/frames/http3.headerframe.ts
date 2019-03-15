import { Http3BaseFrame, Http3FrameType } from "../http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";

/* TODO: QPACK! */

export class Http3HeaderFrame extends Http3BaseFrame {
    private headers: {[property: string]: string} = {};

    public constructor(headers: {[property: string]: string}) {
        super();
        this.headers = headers;
    }

    public toBuffer(): Buffer {
        const encodedLength: Buffer = VLIE.encode(this.getPayloadLength());
        const frameType: Buffer = VLIE.encode(this.getFrameType());
        const payload: Buffer = this.getPayloadBuffer();

        return Buffer.concat([encodedLength, frameType, payload]);
    }
    
    public static fromPayload(buffer: Buffer): Http3HeaderFrame {
        const headers: {[property: string]: string} = {};
        
        // TODO Parsing compressed with QPack
        // Temp uncompressed parsing
        
        const headerList: string[] = buffer.toString('utf8').split('\r\n');
        
        for (let header of headerList) {
            let [property, value] = header.split(":");
            property = property.trim();
            value = value.trim();
            headers[property] = value;
        }
        
        return new Http3HeaderFrame(headers);
    }

    public getHeaders(): {[property: string]: string} {
        return this.headers;
    }
    
    public getPayloadLength(): number {
        return this.getPayloadBuffer().byteLength;
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.HEADERS;
    }
    
    public getHeaderValue(property: string): string | undefined {
        return this.headers[property];
    }
    
    public setHeaderValue(property: string, value: string) {
        this.headers[property] = value;
    }
    
    private getPayloadBuffer(): Buffer {
        // TODO QPACK (headerblock, compression, etc)
        
        let headerBlock = "";
        
        Object.keys(this.headers).forEach(key => {
            const header: string = key + ": " + this.headers[key];
           headerBlock += header;
        });
        
        return new Buffer(headerBlock);
    }
}

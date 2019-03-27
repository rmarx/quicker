import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";
import { Http3Header } from "../qpack/types/http3.header";
import { Http3QPackEncoder } from "../qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "../qpack/http3.qpackdecoder";

/* TODO: QPACK! */

export class Http3HeaderFrame extends Http3BaseFrame {
    private headers: Map<string, string> = new Map<string, string>();
    private requestStreamID: Bignum;
    private encoder: Http3QPackEncoder;

    public constructor(headers: Http3Header[], requestStreamID: Bignum, encoder: Http3QPackEncoder) {
        super();
        for (const header of headers) {
            this.headers.set(header.name, header.value);
        }
        this.requestStreamID = requestStreamID;
        this.encoder = encoder;
    }

    public toBuffer(): Buffer {
        const encodedLength: Buffer = VLIE.encode(this.getPayloadLength());
        const frameType: Buffer = VLIE.encode(this.getFrameType());
        const payload: Buffer = this.getPayloadBuffer();

        return Buffer.concat([encodedLength, frameType, payload]);
    }

    public static fromPayload(buffer: Buffer, requestStreamID: Bignum, encoder: Http3QPackEncoder, decoder: Http3QPackDecoder): Http3HeaderFrame {
        const headers: Http3Header[] = decoder.decodeHeaders(buffer, requestStreamID);

        return new Http3HeaderFrame(headers, requestStreamID, encoder);
    }

    public getHeaders(): Http3Header[] {
        const headerList: Http3Header[] = [];
        this.headers.forEach((value, key) => {
           headerList.push({
               name: key,
               value,
           });
        });
        return headerList;
    }

    public getPayloadLength(): number {
        return this.getPayloadBuffer().byteLength;
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.HEADERS;
    }

    public getHeaderValue(property: string): string | undefined {
        return this.headers.get(property);
    }

    public setHeaderValue(property: string, value: string) {
        this.headers.set(property, value);
    }
    
    public setHeaders(headers: Http3Header[]) {
        this.headers.clear();
        for (const header of headers) {
            this.headers.set(header.name, header.value);
        }
    }

    private getPayloadBuffer(): Buffer {
        return this.encoder.encodeHeaders(this.getHeaders(), this.requestStreamID);
    }
}

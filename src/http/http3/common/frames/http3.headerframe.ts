import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE } from "../../../../types/vlie";
import { Http3Header } from "../qpack/types/http3.header";
import { Http3QPackEncoder } from "../qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "../qpack/http3.qpackdecoder";

// TODO check for uppercase headers -> Malformed

export class Http3HeaderFrame extends Http3BaseFrame {
    private headers: Map<string, string> = new Map<string, string>();
    private pseudoHeaders: Map<string, string> = new Map<string, string>();
    private requestStreamID: Bignum;
    private encoder: Http3QPackEncoder;

    public constructor(headers: Http3Header[], requestStreamID: Bignum, encoder: Http3QPackEncoder) {
        super();
        this.setHeaders(headers);
        this.requestStreamID = requestStreamID;
        this.encoder = encoder;
    }

    public toBuffer(): Buffer {
        const frameType: Buffer = VLIE.encode(this.getFrameType());
        const payload: Buffer = this.encode();
        const encodedLength: Buffer = VLIE.encode(payload.byteLength);

        return Buffer.concat([frameType, encodedLength, payload]);
    }

    public static fromPayload(buffer: Buffer, requestStreamID: Bignum, encoder: Http3QPackEncoder, decoder: Http3QPackDecoder): Http3HeaderFrame {
        const headers: Http3Header[] = decoder.decodeHeaders(buffer, requestStreamID);

        return new Http3HeaderFrame(headers, requestStreamID, encoder);
    }

    public getHeaders(): Http3Header[] {
        const headerList: Http3Header[] = [];

        // Pseudo headers have to come before normal headers
        this.pseudoHeaders.forEach((value, key) => {
            headerList.push({
                name: key,
                value,
            });
        });
        this.headers.forEach((value, key) => {
           headerList.push({
               name: key,
               value,
           });
        });

        return headerList;
    }

    public getEncodedLength(): number {
        // Use dryrun so encoder doesn't automatically transmit updates to decoder
        return this.encode(true).byteLength;
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.HEADERS;
    }

    public getHeaderValue(property: string): string | undefined {
        if (property[0] === ":") {
            return this.pseudoHeaders.get(property.toLowerCase());
        } else {
            return this.headers.get(property.toLowerCase());
        }
    }

    public setHeaderValue(property: string, value: string) {
        if (property[0] === ":") {
            this.pseudoHeaders.set(property.toLowerCase(), value);
        } else {
            this.headers.set(property.toLowerCase(), value);
        }
    }
    
    public setHeaders(headers: Http3Header[]) {
        this.headers.clear();
        for (const header of headers) {
            if (header.name[0] === ":") {
                this.pseudoHeaders.set(header.name.toLowerCase(), header.value);
            } else {
                this.headers.set(header.name.toLowerCase(), header.value);
            }
        }
    }

    // Dryrun can be enabled so the encoder doesn't automatically send encoder stream data to the decoder
    private encode(dryrun: boolean = false): Buffer {
        return this.encoder.encodeHeaders(this.getHeaders(), this.requestStreamID, dryrun);
    }
}

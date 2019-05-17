import { Http3HeaderFrame, Http3DataFrame } from "./frames";
import { Http3Request } from "./http3.request";
import { Bignum } from "../../../types/bignum";
import { Http3QPackEncoder } from "./qpack/http3.qpackencoder";

export class Http3Message {
    private headerFrame: Http3HeaderFrame;
    private payload: Buffer;

    public constructor(headerFrame: Http3HeaderFrame, dataFrames: Http3DataFrame[], trailingHeaderFrame?: Http3HeaderFrame) {
        this.headerFrame = headerFrame;

        const frameData: Buffer[] = dataFrames.map((frame) => {
            return frame.getPayload();
        });
        this.payload = Buffer.concat(frameData);

        if (trailingHeaderFrame !== undefined) {
            for (const header of trailingHeaderFrame.getHeaders()) {
                this.headerFrame.setHeaderValue(header.name, header.value);
            }
        }
    }

    public toRequest(requestStreamID: Bignum, encoder: Http3QPackEncoder): Http3Request {
        const request: Http3Request = new Http3Request(requestStreamID, encoder, this.headerFrame.getHeaders());
        request.setContent(this.payload);
        return request;
    }

    public getHeaderFrame(): Http3HeaderFrame {
        return this.headerFrame;
    }

    public getPayload(): Buffer {
        return this.payload;
    }
}
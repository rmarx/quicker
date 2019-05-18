import { Http3HeaderFrame, Http3DataFrame } from "./frames";
import { resolve, extname } from "path";
import { existsSync, readFileSync } from "fs";
import { Http3QPackEncoder } from "./qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "./qpack/http3.qpackdecoder";
import { Http3Header } from "./qpack/types/http3.header";
import { Bignum } from "../../../types/bignum";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";

export class Http3Response {
    private ready: boolean = false;
    private content?: Buffer;
    private filePath?: string;
    private headerFrame: Http3HeaderFrame;
    // -> Content-Type

    public constructor(headers: Http3Header[], requestStreamID: Bignum, encoder: Http3QPackEncoder, decoder: Http3QPackDecoder) {
        this.headerFrame = new Http3HeaderFrame(headers, requestStreamID, encoder);
    }

    public toBuffer(): Buffer {
        let buffer: Buffer = this.headerFrame.toBuffer();

        if (this.filePath !== undefined) {
            let absoluteFilePath = this.parsePath(resolve(__dirname) + "/../../../../public" + this.filePath);
            if (!existsSync(absoluteFilePath)) {
                absoluteFilePath = resolve(__dirname) + "/../../../../public/notfound.html";
                this.setStatus(404);
            } else {
                this.setStatus(200);
            }
            VerboseLogging.info("Reading file: " + absoluteFilePath);

            const dataFrame: Http3DataFrame = new Http3DataFrame(readFileSync(absoluteFilePath));
            buffer = Buffer.concat([buffer, dataFrame.toBuffer()]);

        } else if (this.content !== undefined) {
            const dataFrame: Http3DataFrame = new Http3DataFrame(this.content);
            buffer = Buffer.concat([buffer, dataFrame.toBuffer()]);
        }

        return buffer;
    }

    public sendFile(path: string): boolean {
        // Can only send something when no other content has been buffered
        if (this.ready === true) {
            return false;
        }
        this.filePath = path;
        this.ready = true;

        const mimeType: string | null = this.getMimeType(this.getFileExtension());
        if (mimeType !== null) {
            this.setHeaderValue("Content-Type", mimeType);
        } else {
            // TODO throw error or allow no mimetype to be set?
            //throw new Error("HTTP/3 resource mimeType undefined!");
        }

        return true;
    }

    public sendBuffer(content: Buffer, mimeType?: string): boolean {
        // Can only send something when no other content has been buffered
        if (this.content !== undefined || this.filePath != undefined) {
            return false;
        }
        this.content = content;
        this.ready = true;

        // TODO Allow no mimetype to be set?
        if (mimeType !== undefined) {
            this.setHeaderValue("Content-Type", mimeType);
        }

        return true;
    }

    public setStatus(status: number) {
        this.setHeaderValue(":status", status.toString());
    }

    public setHeaderValue(property: string, value: string) {
        this.headerFrame.setHeaderValue(property, value);
    }

    public isReady(): boolean {
        return this.ready;
    }

    public getContent(): Buffer | undefined {
        return this.content;
    }

    public getFilePath(): string | undefined {
        return this.filePath;
    }

    public getFileExtension(): string {
        let absoluteFilePath = this.parsePath(resolve(__dirname) + "/../../../../public" + this.filePath);
        if (!existsSync(absoluteFilePath)) {
            absoluteFilePath = resolve(__dirname) + "/../../../../public/notfound.html";
        }
        return extname(absoluteFilePath);
    }

    public getHeaderFrame(): Http3HeaderFrame {
        return this.headerFrame;
    }

    private parsePath(path: string): string {
        if (path.endsWith("/")) {
            return path + "index.html";
        } else {
            return path;
        }
    }

    private getMimeType(extension: string): string | null {
        // FIXME Incomplete, maybe use https://github.com/broofa/node-mime?
        switch(extension) {
            case ".png": return "image/png";
            case ".jpg": return "image/jpeg";
            case ".jpeg": return "image/jpeg";
            case ".html": return "text/html";
            case ".css": return "text/css";
            case ".js": return "application/javascript";
            case ".txt": return "text/plain";
            default:
                return null;
        }
    }
}

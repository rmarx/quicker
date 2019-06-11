import { Http3HeaderFrame, Http3DataFrame } from "./frames";
import { resolve, extname } from "path";
import { existsSync, readFileSync } from "fs";
import { Http3QPackEncoder } from "./qpack/http3.qpackencoder";
import { Http3QPackDecoder } from "./qpack/http3.qpackdecoder";
import { Http3Header } from "./qpack/types/http3.header";
import { Bignum } from "../../../types/bignum";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { Constants } from "../../../utilities/constants";

export class Http3Response {
    private ready: boolean = false;
    private content?: Buffer;
    private filePath?: string;
    private headerFrame: Http3HeaderFrame;
    // -> Content-Type
    private publicDir: string;

    // Regex to trim query parameters if applicable
    private trimQueryParamsPattern: RegExp = /([^\?]+)(\?.*)?/;

    public constructor(headers: Http3Header[], requestStreamID: Bignum, encoder: Http3QPackEncoder, decoder: Http3QPackDecoder) {
        this.headerFrame = new Http3HeaderFrame(headers, requestStreamID, encoder);
        if (Constants.EXPOSED_SERVER_DIR === undefined) {
            this.publicDir = "/../../../../public";
        } else {
            this.publicDir = "/../../../../public/" + Constants.EXPOSED_SERVER_DIR;
        }
    }

    public toBuffer(): Buffer {
        let dataFrame: Http3DataFrame | undefined;

        this.headerFrame.setHeaderValue("server", "quicker/h3-20");

        if (this.filePath !== undefined) {
            // Trim everything after first '?'
            let trimmedPath: string = this.filePath;
            const matches: RegExpMatchArray | null = this.filePath.match(this.trimQueryParamsPattern);
            if (matches !== null) {
                trimmedPath = matches[1];
            }

            trimmedPath = trimmedPath.replace( new RegExp("%20", "g"), " ");

            let absoluteFilePath = this.parsePath(resolve(__dirname) + this.publicDir + trimmedPath);
            if (!existsSync(absoluteFilePath)) {
                VerboseLogging.error("HTTP3Response:sendFile : file does not exist : " + absoluteFilePath);
                console.error("toBuffer:sendFile : file does not exist : " + absoluteFilePath);
                absoluteFilePath = resolve(__dirname) + this.publicDir + "/notfound.html";
                this.setStatus(404);
            } else {
                this.setStatus(200);
            }
            VerboseLogging.info("Reading file: " + absoluteFilePath);

            dataFrame = new Http3DataFrame(readFileSync(absoluteFilePath));
            this.setHeaderValue("content-length", dataFrame.getEncodedLength().toString());
            return Buffer.concat([this.headerFrame.toBuffer(), dataFrame.toBuffer()]);

        } else if (this.content !== undefined) {
            dataFrame = new Http3DataFrame(this.content);
        }

        if (dataFrame !== undefined) {
            return Buffer.concat([this.headerFrame.toBuffer(), dataFrame.toBuffer()]);
        } else {
            throw new Error("Tried sending a HTTP response without a payload.");
        }
    }

    public sendFile(path: string): boolean {
        // Can only send something when no other content has been buffered
        if (this.ready === true) {
            return false;
        }
        this.filePath = path;
        this.ready = true;

        let mimeType: string;
        try{
            mimeType = Http3Response.extensionToMimetype(this.getFileExtension(), this.filePath);
        }
        catch(e){
            VerboseLogging.error("HTTP3Response:sendFile : extension unknown, defaulting to unknown mimetype " + this.filePath);
            console.error("HTTP3Response:sendFile : extension unknown, defaulting to unknown mimetype " + this.filePath);
            mimeType = "unknown";
        }

        this.setHeaderValue("Content-Type", mimeType);

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
        let absoluteFilePath = this.parsePath(resolve(__dirname) + this.publicDir + this.filePath);
        if (!existsSync(absoluteFilePath)) {
            absoluteFilePath = resolve(__dirname) + this.publicDir + "/notfound.html";
        }
        return extname(absoluteFilePath);
    }

    public getHeaderFrame(): Http3HeaderFrame {
        return this.headerFrame;
    }

    public getMimeType(fullPath:string): string {
        return Http3Response.extensionToMimetype(this.getFileExtension(), fullPath);
    }

    private parsePath(path: string): string {
        if (path.endsWith("/")) {
            return path + "index.html";
        } else {
            return path;
        }
    }

    public static extensionToMimetype(extension: string, fullPath:string): string {
        // FIXME Incomplete, maybe use https://github.com/broofa/node-mime?
        switch(extension.toLowerCase()) {
            case ".png": return "image/png";
            case ".jpg": return "image/jpeg";
            case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".svg": return "image/svg+xml";
            case ".html": return "text/html";
            case ".css": return "text/css";
            case ".js": return "application/javascript";
            case ".txt": return "text/plain";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff";
            case ".ttf": return "font/ttf";
            case ".otf": return "font/otf";
            case ".json": return "application/json";
            case ".xml": return "application/xml";
            case ".gz": return "application/gzip";
            case ".ico": return "image/x-icon";
            case "": return "unknown";
            default:
                if( extension.indexOf("php_debug") >= 0 ){
                    // wikipedia has:
                    // /w/load.php_debug=false&lang=en&modules=startup&only=scripts&skin=vector
                    // /w/load.php_debug=false&lang=en&modules=site.styles&only=styles&skin=vector.css
                    // first is js, other is css
                    if( fullPath.indexOf("only=scripts") >= 0 )
                        return "application/javascript";
                    else if( fullPath.indexOf("only=styles") )
                        return "text/css";
                    else
                        throw new Error("Conversion from .php_debug extension to mimetype unsuccessful, could not match extension to mimetype. Extension: " + extension + ", full path: " + fullPath);
                }
                else{
                    // TODO Implement appropriate error
                    throw new Error("Conversion from extension to mimetype unsuccessful, could not match extension to mimetype. Extension: " + extension + ", full path: " + fullPath);
                }
        }
    }

    public static mimeTypeToExtension(mimetype: string): string {
        // FIXME Incomplete, maybe use https://github.com/broofa/node-mime?
        switch(mimetype.toLowerCase()) {
            case "image/png": return ".png";
            case "image/jpeg": return ".jpg";
            case "image/gif": return ".gif";
            case "image/svg+xml": return ".svg";
            case "text/html": return ".html";
            case "application/javascript": return ".css";
            case "application/javascript": return ".js";
            case "text/plain": return ".txt";
            case "font/woff": return ".woff";
            case "font/ttf": return ".ttf";
            case "font/otf": return ".otf";
            case "application/json": return ".json";
            case "application/xml": return ".xml";
            case "application/gzip": return ".gz";
            case "image/x-icon": return ".ico";
            case "unknown": return "";
            default:
                // TODO Implement appropriate error
                throw new Error("Conversion from mimetype to extension unsuccessful, could not match mimetype to extension. Mimetype: " + mimetype);
        }
    }
}

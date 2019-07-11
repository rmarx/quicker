import { createReadStream, existsSync } from "fs";
import { resolve, extname } from "path";
import { EventEmitter } from "events";
import * as readline from "readline";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";

export enum Http3ResourceParserEvent {
    FILES_FOUND = "files found",
}

// Emits event each time a new resource is found
export class Http3ResourceParser extends EventEmitter {
    private newlineRegex: RegExp = /\r?\n/g;
    private srcRegex: RegExp = /src="[a-zA-Z0-9_\/.]+"/g;

    public constructor() {
        super();
    }

    // Fixme this shouldnt use buffers but read files instead, this requires whole files to be kept completely in memory
    public parseBuffer(requestedFile: Buffer, mimeType: string): void {
        if (this.parseMimeTypeForResources(mimeType)) {
            this.parse(requestedFile);
        }
    }

    private parse(requestedFile: Buffer) {
        // FIXME Reading the buffer completely at once is bad, doubles the amount of memory consumed
        const lines: string[] = requestedFile.toString("utf-8").split(this.newlineRegex);
        for (const line of lines) {
            // TODO currently doesn't optimally match with full path names
            let matches: RegExpMatchArray | null = line.match(this.srcRegex);
            if (matches !== null) {
                matches = matches.map((srcMatch: string) => {
                    let file: string = srcMatch.substr(5, srcMatch.length - 5 - 1);
                    if (file[0] !== "/") {
                        file = "/" + file;
                    }
                    return file;
                });
                this.emit(Http3ResourceParserEvent.FILES_FOUND, matches);
            }
        }
    }

    private parseMimeTypeForResources(extension: string): boolean {
        switch(extension) {
            case "text/html":
            case "application/javascript":
                return true;
            default:
                return false;
        }
    }
}
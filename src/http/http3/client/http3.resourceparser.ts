import { createReadStream, existsSync } from "fs";
import { resolve, extname } from "path";
import { EventEmitter } from "events";
import * as readline from "readline";

export enum Http3ResourceParserEvent {
    FILES_FOUND = "files found",
}

// Emits event each time a new resource is found
export class Http3ResourceParser extends EventEmitter {
    private newlineRegex: RegExp = /\r?\n/g;
    private fileRegex: RegExp = /^(\/[a-zA-Z0-9_]+)+(\.[a-zA-Z0-9_]+)+$/g;

    public constructor() {
        super();
    }

    // Fixme this shouldnt use buffers but read files instead, this requires whole files to be kept completely in memory
    public parseBuffer(requestedFile: Buffer, mimeType: string): void {
        if (this.parseMimeTypeForResources(mimeType)) {
            this.parseAsync(requestedFile);
        }
    }

    private async parseAsync(requestedFile: Buffer) {
        // FIXME Reading the buffer completely at once is bad, doubles the amount of memory consumed
        const lines: string[] = requestedFile.toString("utf-8").split(this.newlineRegex);
        for (const line of lines) {
            // TODO currently doesn't optimally match with full path names
            const matches: RegExpMatchArray | null = line.match(this.fileRegex);
            if (matches !== null) {
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
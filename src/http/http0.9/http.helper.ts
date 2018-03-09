import { readFileSync } from "fs";
import { resolve } from "path";

export class HttpHelper {

    public createRequest(req: string): Buffer {
        var requestString = "GET ";
        if (req.indexOf('/') !== 0) {
            requestString += '/';
        }
        requestString += req;
        if (!req.endsWith('\n')) {
            requestString += "\n";
        }
        return Buffer.from(requestString);
    }

    public handleRequest(data: Buffer): Buffer {
        var request = this.parse(data);
        return readFileSync(resolve(__dirname) + "/../../../public" + request);
    }

    private parse(data: Buffer) {
        var request = data.toString('utf8');
        if (request.endsWith('/')) {
            request += "index.html";
        }
        request = request.split('\n').join('').split('\r').join('');
        return request.toLowerCase().replace('get ','');
    }
}
import { Http3Server } from "./http3.server";
import { Http3Request } from "../common/http3.request";
import { Http3Response } from "../common/http3.response";
import { resolve } from "path";
import { Constants } from "../../../utilities/constants";
import { VerboseLogging } from "../../../utilities/logging/verbose.logging";
import { readFileSync } from "fs";
import { Http3RequestMetadata } from "../client/http3.requestmetadata";

// node demoserver.js scheme_name qlog_file_name log_file_name exposed_public_subdir

// const schemeName: string | undefined = process.argv[2] || undefined;
// Constants.QLOG_FILE_NAME = process.argv[3] || undefined;
// const logFileName: string | undefined = process.argv[4] || undefined;
// if (logFileName !== undefined) {
//     Constants.LOG_FILE_NAME = logFileName;
// }

// Constants.EXPOSED_SERVER_DIR = process.argv[5] || (Constants.EXPOSED_SERVER_DIR !== undefined ? Constants.EXPOSED_SERVER_DIR : undefined);

// const resourceListName: string | undefined = process.argv[6] || undefined;
// const resourceList: {[path: string]: Http3RequestMetadata} | undefined = resourceListName === undefined ? undefined : JSON.parse(readFileSync(resourceListName, "utf-8")).resources;

const schemeName = undefined;
const resourceList = undefined;
let host = process.argv[2] || "0.0.0.0";
let port = parseInt(process.argv[3]) || 4433;
let key  = process.argv[4] || "../../../../../keys/selfsigned_default.key";
let cert = process.argv[5] || "../../../../../keys/selfsigned_default.crt";

if (isNaN(Number(port))) {
    console.log("port must be a number: node ./main.js 127.0.0.1 4433 ca.key ca.cert");
    process.exit(-1);
}

Constants.LOG_FILE_NAME = "server.log";

VerboseLogging.info("Running QUICker server at " + host + ":" + port + ", with certs: " + key + ", " + cert);

let server: Http3Server = new Http3Server(resolve(__dirname + key), resolve(__dirname + cert), "rr", resourceList);
server.listen(port, host);

console.log("HTTP/3 server listening on port "+ host +":"+ port +", log level " + Constants.LOG_LEVEL);

server.get(`/`, getRoot);
server.get(`/index.html`, getRoot);
server.get(`/script.js`, getJS);
server.get(`/image.jpg`, getImage);
server.get(`/QUIC.png`, getQUICImage);
server.get(`/QUIC_lowres.png`, getQUICImageLowRes);

async function getRoot(req: Http3Request, res: Http3Response) {
    res.sendFile("/");
}

async function getJS(req: Http3Request, res: Http3Response) {
    res.sendFile("/script.js");
}

async function getImage(req: Http3Request, res: Http3Response) {
    res.sendFile("/image.jpg");
}

async function getQUICImage(req: Http3Request, res: Http3Response) {
    res.sendFile("/QUIC.png");
}

async function getQUICImageLowRes(req: Http3Request, res: Http3Response) {
    res.sendFile("/QUIC_lowres.png");
}
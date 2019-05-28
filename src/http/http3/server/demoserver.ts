import { Http3Server } from "./http3.server";
import { Http3Request } from "../common/http3.request";
import { Http3Response } from "../common/http3.response";
import { resolve } from "path";
import { Constants } from "../../../utilities/constants";

// node demoserver.js scheme_name qlog_file_name log_file_name exposed_public_subdir

const schemeName: string | undefined = process.argv[2] || undefined;
Constants.QLOG_FILE_NAME = process.argv[3] || undefined;
const logFileName: string | undefined = process.argv[4] || undefined;
if (logFileName !== undefined) {
    Constants.LOG_FILE_NAME = logFileName;
}
Constants.EXPOSED_SERVER_DIR = process.argv[5] || undefined;

let server: Http3Server = new Http3Server(resolve(__dirname + "../../../../../keys/selfsigned_default.key"), resolve(__dirname + "../../../../../keys/selfsigned_default.crt"), schemeName);
server.listen(4433, "127.0.0.1");

console.log("HTTP/3 server listening on port 4433");

server.get(`/`, getRoot);
server.get(`/index.html`, getRoot);
server.get(`/script.js`, getJS);
server.get(`/image.jpg`, getImage);
server.get(`/QUIC.png`, getQUICImage);
server.get(`/QUIC_lowres.png`, getQUICImageLowRes);

async function getRoot(req: Http3Request, res: Http3Response) {
    res.sendFile("/");
    res.setHeaderValue("cookies", "was-handled"); // FIXME remove, just for testing purpose
}

async function getJS(req: Http3Request, res: Http3Response) {
    res.sendFile("/script.js");
    res.setHeaderValue("cookies", "was-handled"); // FIXME remove, just for testing purpose
}

async function getImage(req: Http3Request, res: Http3Response) {
    res.sendFile("/image.jpg");
    res.setHeaderValue("cookies", "was-handled"); // FIXME remove, just for testing purpose
}

async function getQUICImage(req: Http3Request, res: Http3Response) {
    res.sendFile("/QUIC.png");
    res.setHeaderValue("cookies", "was-handled"); // FIXME remove, just for testing purpose
}

async function getQUICImageLowRes(req: Http3Request, res: Http3Response) {
    res.sendFile("/QUIC_lowres.png");
    res.setHeaderValue("cookies", "was-handled"); // FIXME remove, just for testing purpose
}
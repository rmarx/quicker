import { Http3Server } from "./http3.server";
import { Http3Request } from "../common/http3.request";
import { Http3Response } from "../common/http3.response";
import { resolve } from "path";

let server: Http3Server = new Http3Server(resolve(__dirname + "../../../../../keys/selfsigned_default.key"), resolve(__dirname + "../../../../../keys/selfsigned_default.crt"));
server.listen(4433, "127.0.0.1");

console.log("HTTP/3 server listening on port 4433");

server.get(`/`, getRoot);
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
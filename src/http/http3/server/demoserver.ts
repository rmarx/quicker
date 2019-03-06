import { Http3Server } from "./http3.server";
import { Http3Request } from "../common/http3.request";
import { Http3Response } from "../common/http3.response";
import { resolve } from "path";

let server: Http3Server = new Http3Server(resolve(__dirname + "../../../../../keys/selfsigned_default.key"), resolve(__dirname + "../../../../../keys/selfsigned_default.crt"));
server.listen(4433);

console.log("HTTP/3 server listening on port 4433");

server.get(`/`, getRoot);

async function getRoot(req: Http3Request, res: Http3Response) {
    res.sendFile("/");
}

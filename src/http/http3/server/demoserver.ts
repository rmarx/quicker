import { Http3Server } from "./http3.server";
import { Http3Request } from "../common/http3.request";
import { Http3Response } from "../common/http3.response";

let server: Http3Server = new Http3Server();
server.listen(4443);

server.get(`/`, getRoot);

async function getRoot(req: Http3Request, res: Http3Response) {

}

import { Server } from "./quicker/server";
import { readFileSync } from "fs";

if (process.argv.length < 6) {
    console.log("not enough arguments specified: node ./main.js 127.0.0.1 4433 ca.key ca.cert");
    process.exit(-1);
}
if (isNaN(Number(process.argv[3]))) {
    console.log("port must be a number: node ./main.js 127.0.0.1 4433 ca.key ca.cert");
    process.exit(-1);
}

var server = Server.createServer({
    key: readFileSync(process.argv[4]),
    cert: readFileSync(process.argv[5])
});
server.listen(Number(process.argv[3]), process.argv[2]);

server.on('draining', (connectionId: string) => {
    console.log("connection with connectionID " + connectionId + " is draining");
});

server.on('closed', (connectionId: string) => {
    console.log("connection with connectionID " + connectionId + " is closed");
});
import { Server } from "./quicker/server";
import { Bignum } from "./utilities/bignum";
import { PacketNumber, ConnectionID } from "./packet/header/base.header";

var pn = PacketNumber.randomPacketNumber();
console.log(pn.toString());
var cid = ConnectionID.randomConnectionID();
var firstHalf = pn.toBuffer().readUInt32BE(0).toString(16); // 4294967295
var secondHalf =pn.toBuffer().readUInt32BE(4).toString(16); // 4294967295
console.log("first: " + firstHalf);
console.log("first: " + secondHalf);
console.log(cid.toString());
console.log(pn.toString());
for(var i = 0; i < 10; i++) {
    pn = PacketNumber.randomPacketNumber();
    console.log(pn.toBuffer().toString('hex'));
}

var server = new Server();
server.listen('localhost', 10000);
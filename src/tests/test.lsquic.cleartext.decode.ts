import { AEAD } from '../crypto/aead';
import { QTLS } from '../crypto/qtls';
import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../packet/header/header.properties';
import { HeaderParser, HeaderOffset } from '../utilities/parsers/header.parser';
import { HeaderHandler } from '../utilities/handlers/header.handler';
import { PacketHandler } from '../utilities/handlers/packet.handler';
import { PacketOffset, PacketParser } from '../utilities/parsers/packet.parser';
import { Time } from '../types/time';

export class TestLsquicCleartextDecode  {

    public static execute(): boolean {
        let result:boolean = false;

        // we had problems with packet numbers of 4 bytes, this test vector includes such a Pn for an initial packet 
        let msg = Buffer.from("ffff00000fb50ef186a54a5a608de0401b95e847a360008a823795f7004099f5a28be43296bd4c58c92099808964a31fd1609ea78b1c7c07bfb8eaf2ef906f7df47dd39ae5eb70f7b7cb09ec1e185f3652d2a4612798cb6fda692a71854b66a8e436da85abb9d9fb47de401c755c1536877f5044bf3719596fb6227946361f36c7fa3245992553f48934fe9c0af308a2d5585a60656bb0f5b8a9d64fb9d4af66c10d13a65a16eb40cdfcbff84210efd261df637429f1d91c", "hex");
        let connectionID = new ConnectionID( Buffer.from("053ece6cac", "hex"), "053ece6cac".length / 2 );

        console.log("Initial dest connection id : ", connectionID.toString());

        let headerParser = new HeaderParser();
        let headerHandler = new HeaderHandler();
        let packetHandler = new PacketHandler();
        let packetParser = new PacketParser();

        let receivedTime = Time.now();

        let connection = new Connection({address: "", port: 1234, family: ""}, EndpointType.Client, createSocket( "udp4" ) );
        connection.setInitialDestConnectionID( connectionID );

        var headerOffsets: HeaderOffset[] = headerParser.parse(msg);
        headerOffsets.forEach((headerOffset: HeaderOffset) => {
            let fullHeaderOffset = headerHandler.handle(connection, headerOffset, msg, EndpointType.Server);
            var packetOffset: PacketOffset = packetParser.parse(connection, fullHeaderOffset!, msg, EndpointType.Server);
            packetHandler.handle(connection, packetOffset.packet, receivedTime);
        });

        // error was using decodedPn instead of decryptedPn for the AD composition (see header.handler.ts)
        // for low packet nrs, most implementations just use the first byte, and decoded = decrypted, because the first bit is 0  -> so decryptoed was 00 and decoded as well, up to about 127 packets 
        // picoquic and lsquic used 4-byte pns immediately, which has c0 at the start, which borked our setup immediately

        return result;
    }
}
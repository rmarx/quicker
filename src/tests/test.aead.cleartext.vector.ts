
import { AEAD } from '../crypto/aead';
import { QTLS } from '../crypto/qtls';
import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../packet/header/header.properties';

export class TestAeaedCleartextVector  {

    public static execute(): boolean {
        let result:boolean = false;

        let connectionID = new ConnectionID( Buffer.from("8394c8f03e515708", "hex"), "8394c8f03e515708".length / 2 );

        let qtls:QTLS = new QTLS(true, {}, new Connection({address: "", port: 1234, family: ""}, EndpointType.Server, createSocket( "udp4" ), connectionID ));
        let aead:AEAD = new AEAD(qtls);

        aead.generateClearTextSecrets( connectionID, qtls, new Version( Buffer.from("ff00000e", "hex")) ); 

        console.log("Need to manually compare the output above from AEAD with what's listed at https://github.com/quicwg/base-drafts/wiki/Test-Vector-for-the-Clear-Text-AEAD-key-derivation");

        return result;
    }
}
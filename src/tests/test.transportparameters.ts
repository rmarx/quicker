import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../packet/header/header.properties';
import { TransportParameters, TransportParameterId } from '../crypto/transport.parameters';
import { VerboseLogging } from '../utilities/logging/verbose.logging';

export class TestTransportParameters  {

    public static testEncodeDecode( testID:number, tps:TransportParameters ){
        let encoded1:Buffer = tps.toBuffer();
        let decoded1:TransportParameters = TransportParameters.fromBuffer(true, encoded1);
        let encoded2:Buffer = decoded1.toBuffer();

        let result = encoded1.toString('hex') === encoded2.toString('hex');
        if( !result )
            VerboseLogging.error("TestTransportParameters : " + testID + " : double encoding gives different results : " + encoded1.toString('hex') + " != " + encoded2.toString('hex'));
        
        return result;
    }

    public static execute(): boolean {
        let result:boolean = false;

        let transportParameters1:TransportParameters = TransportParameters.getDefaultTransportParameters(true);
        transportParameters1.setTransportParameter( TransportParameterId.ORIGINAL_CONNECTION_ID, new ConnectionID(Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]), 4) );

        let result1 = TestTransportParameters.testEncodeDecode(1, transportParameters1);


        let transportParameters2:TransportParameters = TransportParameters.getDefaultTransportParameters(false);
        transportParameters2.setTransportParameter( TransportParameterId.ORIGINAL_CONNECTION_ID, new ConnectionID(Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xff, 0x11, 0x22, 0x33]), 8) );

        let result2 = TestTransportParameters.testEncodeDecode(2, transportParameters2);


        return result1 && result2;
    }
}
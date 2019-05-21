import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../packet/header/header.properties';
import { TransportParameters, TransportParameterId } from '../crypto/transport.parameters';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { HeaderParser } from '../utilities/parsers/header.parser';
import { FrameFactory } from '../utilities/factories/frame.factory';
import { FrameParser } from '../utilities/parsers/frame.parser';
import { ApplicationCloseFrame } from '../frame/close';


export class TestFrameParser  {

    public static execute(): boolean {
        
        let closeFrame = FrameFactory.createApplicationCloseFrame( 15, "Test case for the APPLICATION_CLOSE frame." );
        let closeBuffer = closeFrame.toBuffer();

        let parser = new FrameParser();
        let parsedFrame = parser.parse( closeBuffer, 0 )[0] as ApplicationCloseFrame;

        console.log(parsedFrame.getErrorCode(), parsedFrame.getErrorPhrase());

        return true; //&& result2;
    }
}
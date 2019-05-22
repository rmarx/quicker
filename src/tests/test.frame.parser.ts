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
        
        let closeFrame = FrameFactory.createApplicationCloseFrame( 15, "Test case for the APPLICATION_CLOSE frame. END" );
        let closeBuffer = closeFrame.toBuffer();

        let parser = new FrameParser();
        let parsedFrame = parser.parse( closeBuffer, 0 )[0] as ApplicationCloseFrame;

        console.log(parsedFrame.getErrorCode(), parsedFrame.getErrorPhrase());

        let closeFrame2 = FrameFactory.createApplicationCloseFrame( 15, "" );
        let closeBuffer2 = closeFrame2.toBuffer();

        let parser2 = new FrameParser();
        let parsedFrame2 = parser.parse( closeBuffer2, 0 )[0] as ApplicationCloseFrame;

        console.log(parsedFrame2.getErrorCode(), parsedFrame2.getErrorPhrase());

        return true; //&& result2;
    }
}
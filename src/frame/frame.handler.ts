import {Connection} from '../quicker/connection';
import {BaseFrame, FrameType} from './base.frame';


export class FrameHandler {


    public handle(connection: Connection, frame: BaseFrame) {
        switch (frame.getType()) {
            case FrameType.PADDING:
            case FrameType.RST_STREAM:
            case FrameType.CONNECTION_CLOSE:
            case FrameType.APPLICATION_CLOSE:
            case FrameType.MAX_DATA:
            case FrameType.MAX_STREAM_DATA:
            case FrameType.MAX_STREAM_ID:
            case FrameType.PING:
            case FrameType.BLOCKED:
            case FrameType.STREAM_BLOCKED:
            case FrameType.STREAM_ID_BLOCKED:
            case FrameType.NEW_CONNECTION_ID:
            case FrameType.STOP_SENDING:
            case FrameType.PONG:
            case FrameType.ACK:
        }
        if (type >= FrameType.STREAM) {
        }
    }
}
import { BasePacket } from "../base.packet";
import { BaseHeader } from "../header/base.header";
import { StreamFrame } from "./../../frame/general/stream";
import { PaddingFrame } from "./../../frame/general/padding";
import { Constants } from "./../../utilities/constants";
import { AEAD } from "./../../crypto/aead";
import { EndpointType } from "./../../quicker/type";
import { assert } from "console";

export class ClientInitialPacket extends BasePacket {

    private streamFrame: StreamFrame;
    private aead: AEAD;
    
    public constructor(header: BaseHeader, streamFrame: StreamFrame) {
        super( header);
        this.streamFrame = streamFrame;
        this.aead = new AEAD();
    }

    /**
     * Method to get buffer object from a ClientInitialPacket object
     */
    public toBuffer() {
        if (this.getHeader() === undefined) {
            throw Error("Header is not defined");
        }
        var headerBuffer = this.getHeader().toBuffer();
        var streamBuffer = this.streamFrame.toBuffer();
        var paddingSize = Constants.CLIENT_INITIAL_MIN_SIZE - streamBuffer.byteLength;
        var paddingFrame = new PaddingFrame(paddingSize);

        var dataBuffer = Buffer.alloc(Constants.CLIENT_INITIAL_MIN_SIZE);
        streamBuffer.copy(dataBuffer, 0);
        paddingFrame.toBuffer().copy(dataBuffer, streamBuffer.byteLength);
        var connectionid = this.getHeader().getConnectionID();
        if(connectionid !== undefined) {
            dataBuffer = this.aead.clearTextEncrypt(connectionid, dataBuffer, EndpointType.Client);
        }

        var buffer = Buffer.alloc(headerBuffer.byteLength + Constants.CLIENT_INITIAL_MIN_SIZE);
        var offset = 0;
        headerBuffer.copy(buffer, offset);
        offset += headerBuffer.byteLength;
        streamBuffer.copy(buffer, offset);
        offset += streamBuffer.byteLength;
        paddingFrame.toBuffer().copy(buffer, offset);
        
        return buffer;
    }

    public setStreamFrame(streamFrame: StreamFrame) {
        this.streamFrame = streamFrame;
    }

    public getStreamFrame(): StreamFrame {
        return this.streamFrame;
    }
}
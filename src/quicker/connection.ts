import { RemoteInfo } from "dgram";
import { ConnectionID } from "./../packet/header/base.header";
import { Stream } from "stream";

export class Connection {
    
    private connectionID: ConnectionID;
    private remoteInfo: RemoteInfo;
    private state: ConnectionState;
    private streams: StreamMap;

    public constructor(remoteInfo: RemoteInfo) {
        this.remoteInfo  =remoteInfo;
    }

    public getRemoteInfo(): RemoteInfo {
        return this.remoteInfo;
    }

    public getConnectionID(): ConnectionID {
        return this.connectionID;
    }

    public setConnectionID(connectionID: ConnectionID) {
        this.connectionID = connectionID;
    }

    public getState(): ConnectionState {
        return this.state;
    }

    public setState(connectionState: ConnectionState) {
        this.state = connectionState;
    }

}

export enum ConnectionState {
    OPEN,
    SHUTTING_DOWN,
    CLOSED
}
interface StreamMap {
    [key: number]: Stream;
 }
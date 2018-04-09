import {HeaderOffset} from '../utilities/parsers/header.parser';
import {Connection} from './connection';
import {BaseHeader, HeaderType} from '../packet/header/base.header';
import {ShortHeader} from '../packet/header/short.header';
import {ConnectionID} from '../packet/header/header.properties';
import {EndpointType} from '../types/endpoint.type';
import { RemoteInfo, Socket } from 'dgram';
import { SecureContext } from 'tls';
import { EventEmitter } from 'events';


export class ConnectionManager extends EventEmitter{
    private secureContext: SecureContext;
    private serverSockets: { [key: string]: Socket; } = {};
    private options: any;

    private connections: { [key: string]: Connection; } = {};
    private mappedConnections: { [key: string]: string; } = {};
    private omittedConnections: { [key: string]: Connection; } = {};

    public constructor(secureContext: SecureContext, serverSockets: { [key: string]: Socket; }, options: any) {
        super();
        this.secureContext = secureContext;
        this.serverSockets = serverSockets;
        this.options = options;
    }
    
    /**
     * TODO: optimize, first connection takes 4.5ms
     * @param headerOffset 
     * @param rinfo 
     */
    public getConnection(headerOffset: HeaderOffset, rinfo: RemoteInfo): Connection {
        var header: BaseHeader = headerOffset.header;
        var connectionID = header.getConnectionID();
        if (header.getHeaderType() === HeaderType.LongHeader) {
            if (this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
            } else if (this.mappedConnections[connectionID.toString()] !== undefined && this.connections[this.mappedConnections[connectionID.toString()]] !== undefined) {
                return this.connections[this.mappedConnections[connectionID.toString()]];
            }
        } else {
            var shortHeader = <ShortHeader>header;
            var connection = this.getConnectionByRemoteInformation(rinfo);
            if (connection !== undefined) {
                return connection;
            } else if (connectionID !== undefined && this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
            }
        }
        var connection = this.createConnection(connectionID, rinfo);
        return connection;
    }

    private getConnectionByRemoteInformation(rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        var connection = this.omittedConnections[JSON.stringify(remoteInfo)];
        return connection;
    }

    private createConnection(connectionID: ConnectionID, rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        var connection = new Connection(remoteInfo, EndpointType.Server, this.options);
        connection.setSocket(this.serverSockets[rinfo.family]);
        connection.setFirstConnectionID(connectionID);
        var newConnectionID = ConnectionID.randomConnectionID();
        while (newConnectionID.toString() in Object.keys(this.connections)) {
            newConnectionID = ConnectionID.randomConnectionID();
        }
        connection.setConnectionID(newConnectionID);
        this.connections[connection.getConnectionID().toString()] = connection;
        this.mappedConnections[connection.getFirstConnectionID().toString()] = connection.getConnectionID().toString();
        this.emit(ConnectionManagerEvents.CONNECTION_CREATED, connection);
        return connection;
    }

    public deleteConnection(connection: Connection) {
        var conId = connection.getConnectionID().toString();
        Object.keys(this.mappedConnections).forEach((key: string) => {
            if (key === conId) {
                delete this.mappedConnections[key];
            }
        });
        delete this.connections[conId];
    }
}

export enum ConnectionManagerEvents {
    CONNECTION_CREATED = "conman-connection-created",
}
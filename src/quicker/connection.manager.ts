import {HeaderOffset} from '../utilities/parsers/header.parser';
import {Connection} from './connection';
import {BaseHeader, HeaderType} from '../packet/header/base.header';
import {ShortHeader} from '../packet/header/short.header';
import {ConnectionID} from '../packet/header/header.properties';
import {EndpointType} from '../types/endpoint.type';
import { RemoteInfo, Socket } from 'dgram';
import { SecureContext } from 'tls';
import { EventEmitter } from 'events';
import { LongHeader, LongHeaderType } from '../packet/header/long.header';
import { QuickerError } from '../utilities/errors/quicker.error';
import { QuickerErrorCodes } from '../utilities/errors/quicker.codes';


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
     * REFACTOR TODO: optimize, first connection takes 4.5ms
     * @param headerOffset 
     * @param rinfo 
     */
    public getConnection(headerOffset: HeaderOffset, rinfo: RemoteInfo): Connection {
        var header: BaseHeader = headerOffset.header;
        if (header.getHeaderType() === HeaderType.LongHeader) {
            var longHeader = <LongHeader>header;
            var connectionID = longHeader.getDestConnectionID();
            if (this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
            } else if (this.mappedConnections[connectionID.toString()] !== undefined && this.connections[this.mappedConnections[connectionID.toString()]] !== undefined) {
                return this.connections[this.mappedConnections[connectionID.toString()]];
            } else if (header.getPacketType() === LongHeaderType.Initial) {
                return this.createConnection(header, rinfo);
            }
        } else {
            var shortHeader = <ShortHeader>header;
            var connectionID = shortHeader.getDestConnectionID();
            // VERIFY TODO: why do we first lookup by RemoteInfo? isn't connectionID more authoritative? 
            // see https://tools.ietf.org/html/draft-ietf-quic-transport-12#section-6.1 -> only if connectionID is zero-length? 
            var connection = this.getConnectionByRemoteInformation(rinfo);
            if (connection !== undefined) {
                return connection;
            } else if (connectionID !== undefined && this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
            }
            // TODO: in this case, it may be a stateless reset
        }
        throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
    }

    // should only be use for debugging purposes!
    public getConnectionByStringID(connectionID:string){
        return this.connections[connectionID];
    }

    private getConnectionByRemoteInformation(rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        // VERIFY TODO: at this moment, this.omittedConnections is never filled? why?
        var connection = this.omittedConnections[JSON.stringify(remoteInfo)];
        return connection;
    }

    private createConnection(header: BaseHeader, rinfo: RemoteInfo): Connection {
        var remoteInfo = {
            address: rinfo.address,
            port: rinfo.port,
            family: rinfo.family
        };
        var longHeader = <LongHeader> header;
        var headerSrcConnectionID = longHeader.getSrcConnectionID();
        var headerDestConnectionID = longHeader.getDestConnectionID();

        var connection = new Connection(remoteInfo, EndpointType.Server, this.serverSockets[rinfo.family], this.options);
        connection.setInitialDestConnectionID(headerDestConnectionID);
        var srcConnectionID = ConnectionID.randomConnectionID();
        while (srcConnectionID.toString() in Object.keys(this.connections)) {
            srcConnectionID = ConnectionID.randomConnectionID();
        }
        connection.setSrcConnectionID(srcConnectionID);
        connection.setDestConnectionID(headerSrcConnectionID);
        this.connections[connection.getSrcConnectionID().toString()] = connection;
        this.mappedConnections[connection.getInitialDestConnectionID().toString()] = connection.getSrcConnectionID().toString();
        this.emit(ConnectionManagerEvents.CONNECTION_CREATED, connection);
        return connection;
    }

    public deleteConnection(connection: Connection) {
        var conId = connection.getSrcConnectionID().toString();
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
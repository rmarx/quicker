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
import { VerboseLogging } from '../utilities/logging/verbose.logging';

// only used at the server-side, since that manages multiple connections
// at client-side, we expect the higher-level client to create and manage its connection(s) directly 
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
    
    public getConnection(header: BaseHeader, rinfo: RemoteInfo): Connection {
        if (header.getHeaderType() === HeaderType.LongHeader) {
            let longHeader = <LongHeader>header;
            let connectionID = longHeader.getDestConnectionID();

            if (this.connections[connectionID.toString()] !== undefined) {
                return this.connections[connectionID.toString()];
            } else if (this.mappedConnections[connectionID.toString()] !== undefined && this.connections[this.mappedConnections[connectionID.toString()]] !== undefined) {
                return this.connections[this.mappedConnections[connectionID.toString()]];
            } else if (header.getPacketType() === LongHeaderType.Initial) {
                // connection can only be opened by an INITIAL packet. If we get other things (e.g., 0RTT) out of order, they should be buffered and re-processed when the initial is made
                // FIXME: this buffering of out-of-order stuff at the start is not yet done! 
                return this.createConnection(header, rinfo);
            }
            else{
                VerboseLogging.error("ConnectionManager:getConnection: couldn't find or create a connection for id " + connectionID.toString() + ". THIS SHOULD NOT HAPPEN! " + LongHeaderType[header.getPacketType()]);
                console.trace("Connectionmanager:getConnection");
                throw new QuickerError(QuickerErrorCodes.IGNORE_PACKET_ERROR);
            }
        } 
        else {
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

    // should only be used for debugging purposes!
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

        let longHeader = <LongHeader> header;
        let peerSrcConnectionID = longHeader.getSrcConnectionID();
        let peerDestConnectionID = longHeader.getDestConnectionID();

        let connection = new Connection(remoteInfo, EndpointType.Server, this.serverSockets[rinfo.family], peerDestConnectionID, this.options);

        // src is from the viewpoint of the server here. We choose our own, so it is random
        // the client chooses a temporary src for us (Which is called "initialDestConnectionID"), which we ourselves overwrite here
        let ourSrcConnectionID = ConnectionID.randomConnectionID();
        while (ourSrcConnectionID.toString() in Object.keys(this.connections)) {
            ourSrcConnectionID = ConnectionID.randomConnectionID();
        }

        connection.setSrcConnectionID(ourSrcConnectionID);
        connection.setDestConnectionID(peerSrcConnectionID);

        VerboseLogging.info("ConnectionManager:createConnection : " + rinfo.address + ":" + rinfo.port + " (" + rinfo.family + ")  initialDest=" + peerDestConnectionID.toString() + ", server conn ID (src)=" + ourSrcConnectionID.toString() + ", client conn ID (dst)=" + peerSrcConnectionID.toString() );
        VerboseLogging.debug("ConnectionManager:createConnection : current list : " + Object.keys(this.connections).map( (v:string) => v + "," ) );
        VerboseLogging.debug("ConnectionManager:createConnection : current mapped list : " + Object.keys(this.mappedConnections).map( (v:string) => v + "," ) );

        // it is important to keep a mapping from the initialDestID to our new, self-chosen conn-ID, because packets might arrive with that original ID set (e.g., 0RTT, VNEG, duplicate initials)
        this.connections[connection.getSrcConnectionID().toString()] = connection;
        this.mappedConnections[connection.getInitialDestConnectionID().toString()] = connection.getSrcConnectionID().toString();

        this.emit(ConnectionManagerEvents.CONNECTION_CREATED, connection);
        return connection;
    }

    // note: should only be done after a connection has been closed explicitly OR a timeout has happened
    // TODO: add timeout-based method 
    public deleteConnection(connection: Connection) {
        let conId = connection.getInitialDestConnectionID().toString();
        Object.keys(this.mappedConnections).forEach((key: string) => {
            if (key === conId) {
                delete this.mappedConnections[key];
            }
        });

        conId = connection.getSrcConnectionID().toString();
        delete this.connections[conId];
    }
}

export enum ConnectionManagerEvents {
    CONNECTION_CREATED = "conman-connection-created",
}
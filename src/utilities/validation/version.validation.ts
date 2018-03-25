import { Version } from '../../packet/header/header.properties';
import { Connection } from '../../quicker/connection';
import { ClientInitialPacket } from '../../packet/packet/client.initial';
import { BasePacket } from '../../packet/base.packet';
import { HeaderType } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { Constants } from '../../utilities/constants';
import { EndpointType } from '../../types/endpoint.type';
import { QuicError } from '../errors/connection.error';
import { ConnectionErrorCodes } from '../errors/quic.codes';

export class VersionValidation {


    public static validateVersion(version: (Version | undefined), longHeader: LongHeader): Version |  undefined {
        if (version === undefined) {
            // version negotiation
            var negotiatedVersion = undefined;
            Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                if (version === longHeader.getVersion().toString()) {
                    negotiatedVersion = new Version(Buffer.from(version, 'hex'));
                }
            });
            return negotiatedVersion;
        } else {
            if (longHeader.getVersion().toString() === version.toString()) {
                return version;
            }
        }
        throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
    }
}
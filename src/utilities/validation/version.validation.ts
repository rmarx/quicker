import {Version} from '../../types/header.properties';
import { Connection } from '../../types/connection';
import { ClientInitialPacket } from '../../packet/packet/client.initial';
import { BasePacket } from '../../packet/base.packet';
import { HeaderType } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { Constants } from '../../utilities/constants';
import { EndpointType } from '../../types/endpoint.type';

export class VersionValidation {


    public static validateVersion(connection: Connection, longHeader: LongHeader): boolean {
        // version negotiation
        if (connection.getEndpointType() === EndpointType.Client && longHeader.getVersion().toString() === '00000000') {
            return true;
        }
        var versionFound = false;
        Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
            if (version === longHeader.getVersion().toString()) {
                versionFound = true;
                connection.setVersion(new Version(Buffer.from(version, 'hex')));
            }
        });
        return versionFound;
    }
}
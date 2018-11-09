import { Version } from '../../packet/header/header.properties';
import { Connection } from '../../quicker/connection';
import { InitialPacket } from '../../packet/packet/initial';
import { BasePacket } from '../../packet/base.packet';
import { HeaderType } from '../../packet/header/base.header';
import { LongHeader } from '../../packet/header/long.header';
import { Constants } from '../../utilities/constants';
import { EndpointType } from '../../types/endpoint.type';
import { QuicError } from '../errors/connection.error';
import { ConnectionErrorCodes } from '../errors/quic.codes';

export class VersionValidation {


    public static validateVersion(currentConnectionVersion: (Version | undefined), longHeader: LongHeader): Version |  undefined {
        if (currentConnectionVersion === undefined) {
            // first Initial packet: no version negotiated, check if we support the version advertised in the longHeader
            var negotiatedVersion = undefined;
            Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                if (version === longHeader.getVersion().toString()) {
                    negotiatedVersion = new Version(Buffer.from(version, 'hex'));
                }
            });

            return negotiatedVersion; // if no good version found, this returns undefined
        } 
        else {
            if (longHeader.getVersion().toString() === currentConnectionVersion.toString()) {
                return currentConnectionVersion;
            }
            else{
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION, "Version does not match previously agreed upon version : " + currentConnectionVersion.toString() + " != " + longHeader.getVersion().toString());
            }
        }
    }

    public static IsVersionNegotationFlag(version: Version){
        // The version 0x00000000 is reserved to represent version negotiation.
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-3
        return (version.toString() === "00000000");
    }
}
import { Connection } from '../../quicker/connection';
import { EndpointType } from '../../types/endpoint.type';
import { HandshakeState } from '../../crypto/qtls';
import { TransportParameters } from '../../crypto/transport.parameters';

export class HandshakeValidation {

    /**
     * Method to get transportparameters from the extensiondata buffer and validate this data
     * TODO: add validation
     */
    public static validateExtensionData(isServer: boolean, extensionData: Buffer): TransportParameters {
        // see logic in qtls:generateExtensionData, where this data is being written
        var offset = 0;
        if (isServer) {
            var version = extensionData.readUInt32BE(offset);
            offset += 4;
        } else {
            var version = extensionData.readUInt32BE(offset);
            offset += 4;
            var versionLength = extensionData.readUInt8(offset++);
            var negotiatedVersions = [];
            for (var i = 0; i < (versionLength / 4); i++) {
                negotiatedVersions.push(extensionData.readUInt32BE(offset));
                offset += 4;
            }
        }
        var length = extensionData.readUInt16BE(offset);
        offset += 2;
        var transportParamBuffer = Buffer.alloc(length);
        extensionData.copy(transportParamBuffer, 0, offset);
        var transportParameters: TransportParameters = TransportParameters.fromBuffer(isServer, transportParamBuffer);
        
        return transportParameters;
    }
}
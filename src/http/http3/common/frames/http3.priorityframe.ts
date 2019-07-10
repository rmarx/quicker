import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE, VLIEOffset } from "../../../../types/vlie";
import { Http3Error, Http3ErrorCode } from "../errors/http3.error";

export enum PrioritizedElementType {
    REQUEST_STREAM = 0x0,
    PUSH_STREAM = 0x1,
    PLACEHOLDER = 0x2,
    CURRENT_STREAM = 0x3,
}

export enum ElementDependencyType {
    REQUEST_STREAM = 0x0,
    PUSH_STREAM = 0x1,
    PLACEHOLDER = 0x2,
    ROOT = 0x3,
}

export class Http3PriorityFrame extends Http3BaseFrame {
    private prioritizedElementType: PrioritizedElementType = 0;
    private elementDependencyType: ElementDependencyType = 0;
    private prioritizedElementID?: Bignum; // VLIE
    private elementDependencyID?: Bignum; // VLIE
    private weight: number; // Ranging from 0 - 255, add one to get value between 1 - 256

    public constructor(prioritizedElementType: PrioritizedElementType, elementDependencyType: ElementDependencyType, prioritizedElementID?: Bignum | number, elementDependencyID?: Bignum | number, weight: number = 16) {
        super();
        if (prioritizedElementType !== PrioritizedElementType.CURRENT_STREAM && prioritizedElementID === undefined) {
            // FIXME Maybe use other error?
            throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Tried creating a HTTP/3 priority frame without a prioritizedElementID while PET was not of type CURRENT_STREAM");
        }
        if (elementDependencyType !== ElementDependencyType.ROOT && elementDependencyID === undefined) {
            // FIXME Maybe use other error?
            throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Tried creating a HTTP/3 priority frame without a elementDependencyID while EDT was not of type ROOT");
        }
        if (weight < 1 || weight > 256) {
            // FIXME Maybe use other error?
            throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Tried creating a HTTP/3 priority frame with an invalid weight. All weights should be between 1 and 256. Given weight: " + weight);
        }
        this.prioritizedElementType = prioritizedElementType;
        this.elementDependencyType = elementDependencyType;
        if (prioritizedElementID instanceof Bignum) {
            this.prioritizedElementID = prioritizedElementID;
        } else if (prioritizedElementID !== undefined) {
            this.prioritizedElementID = new Bignum(prioritizedElementID);
        }
        if (elementDependencyID instanceof Bignum) {
            this.elementDependencyID = elementDependencyID;
        } else if (elementDependencyID !== undefined) {
            this.elementDependencyID = new Bignum(elementDependencyID);
        }
        this.weight = weight - 1;
    }

    public static fromPayload(payload: Buffer): Http3PriorityFrame {
        let offset = 0;
        // First byte: 2 bits PET - 2 bits EDT - 4 bits empty
        const types: number = payload.readUInt8(offset++);
        const pet: PrioritizedElementType | undefined = Http3PriorityFrame.toPET(types >> 6);
        const edt: ElementDependencyType | undefined = Http3PriorityFrame.toEDT((types & 0x30) >> 4);
        let peid: Bignum | undefined;
        let edid: Bignum | undefined;
        if (pet === undefined || edt === undefined) {
            // TODO: throw error?
            throw new Http3Error(Http3ErrorCode.HTTP3_MALFORMED_FRAME, "Error while parsing HTTP/3 priority frame: PET or EDT fields were undefined");
        }

        if (Http3PriorityFrame.hasPEIDField(pet)) {
            let vlieOffset: VLIEOffset = VLIE.decode(payload, offset);
            peid = vlieOffset.value;
            offset = vlieOffset.offset;
        }
        if (Http3PriorityFrame.hasEDIDField(edt)) {
            let vlieOffset: VLIEOffset = VLIE.decode(payload, offset);
            edid = vlieOffset.value;
            offset = vlieOffset.offset;
        }
        const weight: number = payload.readUInt8(offset) + 1;

        return new Http3PriorityFrame(pet, edt, peid, edid, weight);
    }

    public toBuffer(): Buffer {
        const type: Buffer = VLIE.encode(this.getFrameType());
        const encodedLength: Buffer = VLIE.encode(this.getEncodedLength());

        // TODO Test to make sure payload isnt longer than 2^53 bytes
        let buffer: Buffer = Buffer.alloc(type.byteLength + encodedLength.byteLength + this.getEncodedLength());
        let offset: number = 0;

        // Frametype
        type.copy(buffer, offset);
        offset += type.byteLength;

        // Length
        encodedLength.copy(buffer, offset);
        offset += encodedLength.byteLength;

        // Payload
        // First byte: 2 bits PET - 2 bits EDT - 4 bits empty
        let types: number = this.prioritizedElementType << 6;
        types |= this.elementDependencyType << 4;
        buffer.writeUInt8(types, offset++);

        // Prioritized element ID
        if (this.prioritizedElementID !== undefined) {
            let peid = VLIE.encode(this.prioritizedElementID);
            peid.copy(buffer, offset)
            offset += peid.byteLength;
        }

        // Element dependency ID
        if (this.elementDependencyID !== undefined) {
            let edid = VLIE.encode(this.elementDependencyID);
            edid.copy(buffer, offset)
            offset += edid.byteLength;
        }

        // Priority weight
        buffer.writeUInt8(this.weight, offset);

        return buffer;
    }

    public getEncodedLength(): number {
        let length: number = 2; // 1 byte for PET/EDT, 1 byte for weight

        if (this.prioritizedElementID !== undefined) {
            length += VLIE.getEncodedByteLength(this.prioritizedElementID);
        }

        if (this.elementDependencyID !== undefined) {
            length += VLIE.getEncodedByteLength(this.elementDependencyID);
        }

        return length;
    }

    public getFrameType(): Http3FrameType {
        return Http3FrameType.PRIORITY;
    }

    // Add one to get weight from 1-256
    public getWeight(): number {
        return this.weight + 1;
    }

    public getPET(): PrioritizedElementType {
        return this.prioritizedElementType;
    }

    public getPETString(): string {
        switch (this.prioritizedElementType) {
            case PrioritizedElementType.REQUEST_STREAM:
                return "Request stream";
            case PrioritizedElementType.PUSH_STREAM:
                return "Push stream";
            case PrioritizedElementType.PLACEHOLDER:
                return "Placeholder";
            case PrioritizedElementType.CURRENT_STREAM:
                return "Current stream";
            default:
                return "Undefined";
        }
    }

    public getPEID(): Bignum | undefined {
        return this.prioritizedElementID;
    }

    public getEDT(): ElementDependencyType {
        return this.elementDependencyType;
    }

    public getEDTString(): string {
        switch (this.elementDependencyType) {
            case ElementDependencyType.REQUEST_STREAM:
                return "Request stream";
            case ElementDependencyType.PUSH_STREAM:
                return "Push stream";
            case ElementDependencyType.PLACEHOLDER:
                return "Placeholder";
            case ElementDependencyType.ROOT:
                return "Root";
            default:
                return "Undefined";
        }
    }

    public getEDID(): Bignum | undefined {
        return this.elementDependencyID;
    }

    // Converts a given number into the corresponding PET enum value of undefined if invalid
    private static toPET(type: number): PrioritizedElementType | undefined {
        switch(type) {
            case PrioritizedElementType.REQUEST_STREAM:
                return PrioritizedElementType.REQUEST_STREAM;
            case PrioritizedElementType.PUSH_STREAM:
                return PrioritizedElementType.PUSH_STREAM;
            case PrioritizedElementType.PLACEHOLDER:
                return PrioritizedElementType.PLACEHOLDER;
            case PrioritizedElementType.CURRENT_STREAM:
                return PrioritizedElementType.CURRENT_STREAM;
            default:
                return undefined;
        }
    }

    // Converts a given number into the corresponding EDT enum value of undefined if invalid
    private static toEDT(type: number): ElementDependencyType | undefined {
        switch(type) {
            case ElementDependencyType.REQUEST_STREAM:
                return ElementDependencyType.REQUEST_STREAM;
            case ElementDependencyType.PUSH_STREAM:
                return ElementDependencyType.PUSH_STREAM;
            case ElementDependencyType.PLACEHOLDER:
                return ElementDependencyType.PLACEHOLDER;
            case ElementDependencyType.ROOT:
                return ElementDependencyType.ROOT;
            default:
                return undefined;
        }
    }

    // Checks if there is a PEID field for the given PET
    private static hasPEIDField(pet: PrioritizedElementType): boolean {
        switch(pet) {
            case PrioritizedElementType.REQUEST_STREAM:
            case PrioritizedElementType.PUSH_STREAM:
            case PrioritizedElementType.PLACEHOLDER:
                return true;
            default:
                // CURRENT_STREAM
                return false;
        }
    }

    // Checks if there is a EDID field for the given EDT
    private static hasEDIDField(pet: ElementDependencyType): boolean {
        switch(pet) {
            case ElementDependencyType.REQUEST_STREAM:
            case ElementDependencyType.PUSH_STREAM:
            case ElementDependencyType.PLACEHOLDER:
                return true;
            default:
                // ROOT
                return false;
        }
    }
}

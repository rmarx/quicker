import { Http3BaseFrame, Http3FrameType } from "./http3.baseframe";
import { Bignum } from "../../../../types/bignum";
import { VLIE, VLIEOffset } from "../../../../types/vlie";

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
    private prioritizedElementID: Bignum | undefined; // VLIE
    private elementDependencyID: Bignum | undefined; // VLIE
    private priorityWeight: number = 0; // Ranging from 0 - 255, add one to get value between 1 - 256

    public constructor(payload: Buffer) {
        super();
        this.parsePayload(payload);
    }

    public toBuffer(): Buffer {
        let encodedLength: Buffer = VLIE.encode(this.getEncodedLength());
        // TODO Test to make sure payload isnt longer than 2^53 bytes
        let buffer: Buffer = Buffer.alloc(encodedLength.byteLength + 1 + this.getEncodedLength());

        let offset: number = 0;

        // Length
        encodedLength.copy(buffer);
        offset += encodedLength.byteLength;

        // Frametype
        buffer.writeUInt8(this.getFrameType(), offset++);

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
        buffer.writeUInt8(this.priorityWeight, offset);

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

    // Parses payload and saves the data in the current object
    private parsePayload(payload: Buffer) {
        let offset = 0;
        // First byte: 2 bits PET - 2 bits EDT - 4 bits empty
        let types: number = payload.readUInt8(offset++);
        let pet: PrioritizedElementType | undefined = this.toPET(types >> 6)
        let edt: ElementDependencyType | undefined = this.toEDT((types & 0x30) >> 4)
        if (pet === undefined || edt === undefined) {
            // TODO: throw error?
            return;
        } else {
            this.prioritizedElementType = pet;
            this.elementDependencyType = edt;
        }

        if (this.hasPEIDField(this.prioritizedElementType)) {
            let vlieOffset: VLIEOffset = VLIE.decode(payload, offset);
            this.prioritizedElementID = vlieOffset.value;
            offset = vlieOffset.offset;
        }
        if (this.hasEDIDField(this.elementDependencyType)) {
            let vlieOffset: VLIEOffset = VLIE.decode(payload, offset);
            this.elementDependencyID = vlieOffset.value;
            offset = vlieOffset.offset;
        }
        this.priorityWeight = payload.readUInt8(offset);
    }

    // Converts a given number into the corresponding PET enum value of undefined if invalid
    private toPET(type: number): PrioritizedElementType | undefined {
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
    private toEDT(type: number): ElementDependencyType | undefined {
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
    private hasPEIDField(pet: PrioritizedElementType): boolean {
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
    private hasEDIDField(pet: ElementDependencyType): boolean {
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

import {Bignum} from './bignum';


export class BaseProperty {

    private property: Bignum;

    public constructor(buffer: Buffer, byteSize = 4) {
        this.property = new Bignum(buffer, byteSize);
    }

    protected getProperty(): Bignum {
        return this.property;
    }

    protected setProperty(bignum: Bignum) {
        this.property = bignum;
    }

    public toBuffer(): Buffer {
        return this.property.toBuffer();
    }

    public toString(): string {
        return this.property.toString("hex");
    }
}

export class ConnectionID extends BaseProperty {

    public constructor(buffer: Buffer) {
        super(buffer, 8);
    }

    public getConnectionID(): Bignum {
        return this.getProperty();
    }

    public setConnectionID(bignum: Bignum) {
        this.setProperty(bignum);
    }

    public static randomConnectionID(): ConnectionID {
        var randomBignum = Bignum.random('ffffffffffffffff', 8);
        return new ConnectionID(randomBignum.toBuffer());
    }
}

export class PacketNumber extends BaseProperty {

    public constructor(buffer: Buffer) {
        super(buffer, 8);
    }

    public getPacketNumber(): Bignum {
        return this.getProperty();
    }

    public setPacketNumber(bignum: Bignum) {
        this.setProperty(bignum);
    }

    public getMostSignificantBits(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer().copy(buf, 0, 0, size);
        return buf;
    }

    public getLeastSignificantBits(size: number = 4): Buffer {
        size = size > 8 ? 8 : size;
        var buf = Buffer.alloc(size);
        this.getProperty().toBuffer().copy(buf, 0, 8-size, 8);
        return buf;
    }

    public adjustNumber(packetNumber: PacketNumber, size: number) {
        var mask = Bignum.fromNumber(1);
        for(var i = 0; i < 63; i++) {
            mask = mask.shiftLeft(1);
            if (63 - i > (size * 8)) {
                mask = mask.add(1);
            }
        }
        var maskedResult = this.getPacketNumber().and(mask);
        var next = packetNumber.getPacketNumber().mask(size);
        next = next.add(maskedResult);
        if (next.greaterThan(this.getPacketNumber())) {
            this.setPacketNumber(next);
        }
    }

    public static randomPacketNumber(): PacketNumber {
        var randomBignum = Bignum.random('fffffc00', 8);
        return new PacketNumber(randomBignum.toBuffer());
    }


}


export class Version extends BaseProperty {
    
    public constructor(buffer: Buffer) {
        super(buffer);
    }

    public getVersion(): Bignum {
        return this.getProperty();
    }

    public setVersion(bignum: Bignum) {
        this.setProperty(bignum);
    }
}
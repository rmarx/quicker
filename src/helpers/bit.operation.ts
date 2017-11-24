export class BitOperation {

    public static isBitSet(num: number, bit: number) {
        var mask = 1 << (bit - 1);
        return (num & mask) != 0;
    }
}
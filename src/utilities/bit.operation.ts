export class BitOperation {

    /**
     * Check if the bit in num is set at location bit
     * @param num number to check
     * @param bit location of the bit in num
     */
    public static isBitSet(num: number, bit: number) {
        var mask = 1 << (bit - 1);
        return (num & mask) != 0;
    }
}
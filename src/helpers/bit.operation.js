"use strict";
exports.__esModule = true;
var BitOperation = /** @class */ (function () {
    function BitOperation() {
    }
    BitOperation.isBitSet = function (num, bit) {
        var mask = 1 << (bit - 1);
        return (num & mask) != 0;
    };
    return BitOperation;
}());
exports.BitOperation = BitOperation;

"use strict";
exports.__esModule = true;
var BasePacket = /** @class */ (function () {
    function BasePacket(header) {
        this.header = header;
    }
    BasePacket.prototype.getHeader = function () {
        return this.header;
    };
    BasePacket.prototype.setHeader = function (header) {
        this.header = header;
    };
    return BasePacket;
}());
exports.BasePacket = BasePacket;

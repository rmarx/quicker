"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var BaseHeader = /** @class */ (function () {
    function BaseHeader(type, connectionID, packetNumber) {
        this.type = type;
        this.connectionID = connectionID;
        this.packetNumber = packetNumber;
    }
    BaseHeader.prototype.getType = function () {
        return this.type;
    };
    BaseHeader.prototype.setType = function (type) {
        this.type = type;
    };
    BaseHeader.prototype.getConnectionID = function () {
        return this.connectionID;
    };
    BaseHeader.prototype.setConnectionID = function (connectionId) {
        this.connectionID = connectionId;
    };
    BaseHeader.prototype.getPacketNumber = function () {
        return this.packetNumber;
    };
    BaseHeader.prototype.setPacketNumber = function (packetNumber) {
        this.packetNumber = packetNumber;
    };
    return BaseHeader;
}());
exports.BaseHeader = BaseHeader;
var BaseProperty = /** @class */ (function () {
    function BaseProperty(buffer) {
        this.propertyBuffer = buffer;
    }
    BaseProperty.prototype.getProperty = function () {
        return this.propertyBuffer;
    };
    BaseProperty.prototype.setProperty = function (buffer) {
        this.propertyBuffer = buffer;
    };
    BaseProperty.prototype.toString = function () {
        return this.propertyBuffer.toString("hex");
    };
    return BaseProperty;
}());
exports.BaseProperty = BaseProperty;
var ConnectionID = /** @class */ (function (_super) {
    __extends(ConnectionID, _super);
    function ConnectionID(buffer) {
        var _this = this;
        // Buffer need to be length 8 because connection id is 64 bits long
        if (buffer.length !== 8) {
            // TODO: throw error
            return;
        }
        _this = _super.call(this, buffer) || this;
        return _this;
    }
    ConnectionID.prototype.getConnectionID = function () {
        return this.getProperty();
    };
    ConnectionID.prototype.setConnectionID = function (buffer) {
        this.setProperty(buffer);
    };
    return ConnectionID;
}(BaseProperty));
exports.ConnectionID = ConnectionID;
var PacketNumber = /** @class */ (function (_super) {
    __extends(PacketNumber, _super);
    function PacketNumber(buffer, length) {
        var _this = this;
        // Buffer need to be length 1,2 or 4 given by the length variable
        if (buffer.length !== length) {
            // TODO: throw error
            return;
        }
        _this = _super.call(this, buffer) || this;
        return _this;
    }
    PacketNumber.prototype.getPacketNumber = function () {
        return this.getProperty();
    };
    PacketNumber.prototype.setPacketNumber = function (buffer, length) {
        // Buffer need to be length 1,2 or 4 given by the length variable
        if (buffer.length !== length) {
            // TODO: throw error
            return;
        }
        this.setProperty(buffer);
    };
    PacketNumber.prototype.getLength = function () {
        return this.length;
    };
    return PacketNumber;
}(BaseProperty));
exports.PacketNumber = PacketNumber;

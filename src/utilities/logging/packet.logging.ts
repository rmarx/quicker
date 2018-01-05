import {Connection} from '../../types/connection';
import { BasePacket, PacketType } from "../../packet/base.packet";
import { ConsoleColor } from "./colors";


export class PacketLogging {

    public static logIncomingPacket(connection: Connection, basePacket: BasePacket) {
        this.logPackets(connection, basePacket, "RX", ConsoleColor.FgBlue);
    }

    public static logOutgoingPacket(connection: Connection, basePacket: BasePacket) {
        this.logPackets(connection, basePacket, "TX", ConsoleColor.FgRed);
    }

    private static logPackets(connection: Connection, basePacket: BasePacket, direction: string, color: ConsoleColor) {
        var connectionID = basePacket.getHeader().getConnectionID();
        var connectionIDString = connectionID === undefined ? "omitted" : connectionID.toString();
        var pn = basePacket.getHeader().getPacketNumber().getPacketNumber().toDecimalString();
        console.log(direction + " " + color + "%s(%s)" + ConsoleColor.Reset + " CID: %s, " + color + "PKN: %s" + ConsoleColor.Reset + " " , PacketType[basePacket.getPacketType()],basePacket.getHeader().getPacketType().toString(16), connectionIDString, pn);
    }
}
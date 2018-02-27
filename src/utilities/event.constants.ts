export class EventConstants {

    public static readonly NODE_QTLS_HANDSHAKE_DONE = "handshakedone";

    public static readonly CONNECTION_HANDSHAKE_DONE = "con-handshake-done";
    public static readonly CONNECTION_CLOSE = "con-close";
    public static readonly CONNECTION_DRAINING = "con-draining";
    public static readonly CONNECTION_STREAM = "con-stream";

    public static readonly INTERNAL_STREAM_DATA = "stream-data";
    public static readonly INTERNAL_STREAM_END = "stream-end";

    public static readonly QUIC_STREAM_DATA = "data";
    public static readonly QUIC_STREAM_END = "end";

    public static readonly CLOSE = "close";
    public static readonly ERROR = "error";
    public static readonly DRAINING = "draining";
    public static readonly CONNECTED = "connected";
    public static readonly STREAM = "stream";
    public static readonly MESSAGE = "message";

    public static readonly ALARM_TIMEOUT = "alarm-timeout";
}
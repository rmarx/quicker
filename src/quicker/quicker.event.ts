

export enum QuickerEvent {
    CONNECTION_CLOSE = "close",
    ERROR = "error",
    CONNECTION_DRAINING = "draining",
    CLIENT_CONNECTED = "connected",
    NEW_STREAM = "stream",
    NEW_MESSAGE = "message",
    STREAM_DATA_AVAILABLE = "data",
    STREAM_END = "end",
}
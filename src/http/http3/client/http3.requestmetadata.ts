export interface Http3RequestMetadata {
    isCritical?: boolean,
    inHead?: boolean,
    isBeforeFirstImage?: boolean,
    isAboveTheFold?: boolean,
    isAsync?: boolean,
    isDefer?: boolean,
    isPreload?: boolean,
    mimetype: string,
    deltaStartTime?: number, // ms
    delayPriorityFrame?: number, // ms
    children?: string[], // List of file paths
}
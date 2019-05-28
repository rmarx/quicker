export interface Http3RequestMetadata {
    isCritical?: boolean,
    isBeforeFirstImage?: boolean,
    isAboveTheFold?: boolean,
    isAsync?: boolean,
    isDefer?: boolean,
    isPreload?: boolean,
    extension: string,
    deltaStartTime?: number, // ms
    delayPriorityFrame?: number, // ms
    deps?: string[], // List of file paths
}
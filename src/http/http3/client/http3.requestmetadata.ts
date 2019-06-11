export interface Http3RequestMetadata {
    isCritical?: boolean,
    inHead?: boolean,
    isAfterFirstImage?: boolean,
    isAboveTheFold?: boolean,
    isAsync?: boolean,
    isDefer?: boolean,
    isPreload?: boolean,
    mimeType: string,
    deltaStartTime?: number, // ms
    delayPriorityFrame?: number, // ms
    childrenStart?: string[], // List of file paths that are discovered during transmission of the parent
    childrenEnd?: string[], // List of files that are discovered after the parent is completed
}
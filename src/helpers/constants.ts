export class Constants {
    public static readonly SUPPORTED_VERSIONS = [
        'ff000007'
    ];

    public static readonly VERSION_SALTS: { [id: string] : string; }= {
        'ff000007': 'afc824ec5fc77eca1e9d36f37fb2d46518c36639'
    }

    /**
     * Method for testing purposes only
     */
    public static getActiveVersion() {
        return Constants.SUPPORTED_VERSIONS[0];
    }

    public static getVersionSalt(version: string): string {
        return Constants.VERSION_SALTS[version];
    }

}
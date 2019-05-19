import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { createCipheriv, createDecipheriv } from "crypto";
import { VerboseLogging } from '../utilities/logging/verbose.logging';

export class TestHeaderProtection  {

    public static execute(): boolean {

        // a couple of concrete values taken from an ngtcp2-draft20 run from their logs (run with -s to get the secrets printed out)
        // mainly just to test how the nodejs crypto suite works with ecb mode 
        // e.g., normally we also do .final() but is not needed here for some esoteric reason
        // e.g., the initialization vector is 0

        // client_pp_hp=3271d12d0c6e3faac0e1e8a29294146c
        // mask=0ed450ec840000000000000000000000 sample=da5c83732bb0d8c945563b6ba1a57a5f


        // AEAD_AES_128_GCM
        let hpkey =  Buffer.from("3271d12d0c6e3faac0e1e8a29294146c", "hex");
        let sample = Buffer.from("da5c83732bb0d8c945563b6ba1a57a5f", "hex");
        console.log("HP KEY", hpkey.byteLength, hpkey.toString('hex'));
        console.log("SAMPLE", sample.byteLength, sample.toString('hex'));

        // https://stackoverflow.com/questions/41134562/node-js-crypto-invalid-iv-length
        // ECB mode doesn't have an initialization vector, so just use a 0-length buffer
        let cipher = createCipheriv("aes-128-ecb", hpkey, Buffer.alloc(0));
        let update = cipher.update(sample);

        let result1 = update.slice(0, 5).toString("hex") === "0ed450ec84";

        VerboseLogging.info("update : " + update.slice(0, 5).toString("hex") + " ?= 0ed450ec840000000000000000000000");


        // mask=cbfad5503c0000003c75ff1fa67f0000 sample=e909e8173a59d4567b99c1d7798fbad1
        // hp=74fca5e6b226268c9e90ffbbaed337a2
        hpkey = Buffer.from("8612c66314d38fef7e354297ce1c2522", "hex");
        sample = Buffer.from("e909e8173a59d4567b99c1d7798fbad1", "hex");

        cipher = createCipheriv("aes-128-ecb", hpkey, Buffer.alloc(0));
        update = cipher.update(sample);

        let result2 = update.slice(0, 5).toString("hex") === "cbfad5503c";

        VerboseLogging.info("update : " + update.slice(0, 5).toString("hex") + " ?= cbfad5503c");


        // mask=0931f128540000009c3530c7fc7f0000 sample=77209a5092c9bd1ed32d9caf8ed30d6e
        // hp=a4106654cb3692f67899db487a0cb81e
        hpkey = Buffer.from("a4106654cb3692f67899db487a0cb81e", "hex");
        sample = Buffer.from("77209a5092c9bd1ed32d9caf8ed30d6e", "hex");

        cipher = createCipheriv("aes-128-ecb", hpkey, Buffer.alloc(0));
        update = cipher.update(sample);

        let result3 = update.slice(0, 5).toString("hex") === "0931f12854";

        VerboseLogging.info("update : " + update.slice(0, 5).toString("hex") + " ?= 0931f12854");


        return result1 && result2 && result3;
    }
}
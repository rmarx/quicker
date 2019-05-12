import { PacketNumber } from '../packet/header/header.properties'
import { VerboseLogging } from '../utilities/logging/verbose.logging';

export class TestPNTruncation  {

    // full end-to-end test: both truncation and undo in the same fashion
    public static truncateAndUndo( fullPacketNumber:Array<number>, expectedTruncation:Array<number>, largestAckedNumber:Array<number> ){
        let fullNumber   = new PacketNumber(Buffer.from(fullPacketNumber));
        let largestAcked = new PacketNumber(Buffer.from(largestAckedNumber));
        let expectedTruncated = new PacketNumber(Buffer.from(expectedTruncation));

        let truncated = fullNumber.truncate( largestAcked );

        if( !truncated.getValue().equals( expectedTruncated.getValue() ) ){
            VerboseLogging.error("TestPNTruncation: truncateAndUndo : unexpected truncation : " + truncated.getValue().toString() + " // " + truncated.getValue().toDecimalString() + " != " + expectedTruncated.getValue().toDecimalString() + " // " + + expectedTruncated.getValue().toString() );
            return false;
        }

        let restored  = truncated.restoreFromTruncate( largestAcked );

        if( !restored.getValue().equals(fullNumber.getValue()) ){
            VerboseLogging.error("TestPNTruncation: truncateAndUndo : unexpected restored : " + restored.getValue().toString() + " // " + restored.getValue().toDecimalString() + " != " + fullNumber.getValue().toDecimalString() + " // "  + fullNumber.getValue().toString() );
            return false;
        }

        return true;
    }

    // separately needed for the situation that the receiver is already way ahead and an old packet arrives
    // this packet number needs to be decoded to the lower value correctly
    // see https://github.com/quicwg/base-drafts/issues/674
    // We need this separately because .truncate() has a check for encoding based on a higher ACK, but of course restoration doesn't have that luxury
    public static undoOnly( expectedPacketNumber:Array<number>, truncatedPacket:Array<number>, largestAckedNumber:Array<number> ){
        let expectedNumber   = new PacketNumber(Buffer.from(expectedPacketNumber));
        let largestAcked = new PacketNumber(Buffer.from(largestAckedNumber));
        let truncatedNumber = new PacketNumber(Buffer.from(truncatedPacket));

        let restored  = truncatedNumber.restoreFromTruncate( largestAcked );

        if( !restored.getValue().equals(expectedNumber.getValue()) ){ 
            VerboseLogging.error("TestPNTruncation: undoOnly : unexpected restored : " + restored.getValue().toString() + " // " + restored.getValue().toDecimalString() + " != " + expectedNumber.getValue().toDecimalString() );
            return false;
        }

        return true;
    }

    public static execute(): boolean {

        // inspired by some quicly tests:
        // https://github.com/h2o/quicly/blob/ce9726b1aad3067f5b6a2886435eb5a70494607b/t/test.c#L311
        // and mvfst tests
        // https://github.com/facebookincubator/mvfst/blob/master/quic/codec/test/PacketNumberTest.cpp

        let results = [];

        // edge cases to test for decoding to the "closest" packet number (taken from quicly tests)
        let result0 = TestPNTruncation.undoOnly(        [0xc0],                                             [0xc0],                     [0x1, 0x39] );
        let result1 = TestPNTruncation.undoOnly(        [0x1, 0xc0],                                        [0xc0],                     [0x1, 0x40] );
        
        // simple case 1 byte
        let result2 = TestPNTruncation.truncateAndUndo( [0x10],                                             [0x10],                     [0x0] );
        // simple case 2 bytes
        let result3 = TestPNTruncation.truncateAndUndo( [0x1, 0x00],                                        [0x1, 0x0],                 [0x0] );
        // complex cases 2 bytes (taken from quicly tests)
        let result4 = TestPNTruncation.truncateAndUndo( [0xa8, 0x2f, 0x9b, 0x32],                           [0x9b, 0x32],               [0xa8, 0x2f, 0x30, 0xeb] );
        let result5 = TestPNTruncation.truncateAndUndo( [0x01, 0x00, 0x1F],                                 [0x00, 0x1F],               [0XFE, 0xEB] );
        // simple cases 1,3 and 4 bytes with 64-bit numbers (home-made)
        let result6 = TestPNTruncation.truncateAndUndo( [0xAF, 0xBF, 0xCF, 0xDF, 0xEF, 0xFF, 0x0F],         [0x0F],                     [0xAF, 0xBF, 0xCF, 0xDF, 0xEF, 0xFF, 0x00] );
        let result7 = TestPNTruncation.truncateAndUndo( [0xAF, 0xBF, 0xCF, 0xDF, 0xEF, 0xFF, 0x0F],         [0xEF, 0xFF, 0x0F],         [0xAF, 0xBF, 0xCF, 0xDF, 0xE0, 0x00, 0x00] );
        let result8 = TestPNTruncation.truncateAndUndo( [0xAF, 0xBF, 0xCF, 0xDF, 0xEF, 0xFF, 0x0F],         [0xDF, 0xEF, 0xFF, 0x0F],   [0xAF, 0xBF, 0xCF, 0xDF, 0x00, 0x00, 0x00] );

        // full cases (taken from mvfst tests)
        // 1 byte
        results.push( TestPNTruncation.undoOnly(        [0xaa, 0x82, 0xf2, 0x94],                           [0x94],                     [0xaa, 0x82, 0xf3, 0x0e] ));
        results.push( TestPNTruncation.undoOnly(        [0xaa, 0x83, 0x00, 0x01],                           [0x01],                     [0xaa, 0x82, 0xff, 0xff] ));
        results.push( TestPNTruncation.undoOnly(        [0xaa, 0x83, 0x00, 0x01],                           [0x01],                     [0xaa, 0x82, 0xff, 0xfe] ));

        // 2 bytes
        results.push( TestPNTruncation.undoOnly(        [0xaa, 0x83, 0x1f, 0x94],                           [0x1f, 0x94],               [0xaa, 0x82, 0xf3, 0x0e] ));
        results.push( TestPNTruncation.undoOnly(        [0x90, 0x00],                                       [0x90, 0x00],               [0x1,  0x00, 0x00] ));
        results.push( TestPNTruncation.undoOnly(        [0x1,  0x80, 0x00],                                 [0x80, 0x00],               [0x1,  0x00, 0x00] ));
        results.push( TestPNTruncation.undoOnly(        [0x1,  0x80, 0x00],                                 [0x80, 0x00],               [0xff, 0xff] ));

        results.push( TestPNTruncation.undoOnly(        [0xf1, 0xff, 0xff],                                 [0xff, 0xff],               [0xf2, 0x00, 0x00] ));
        results.push( TestPNTruncation.undoOnly(        [0x1,  0x00, 0x00, 0x00],                           [0x00, 0x00],               [0x0,  0xff, 0xf0, 0x0f] ));
        results.push( TestPNTruncation.undoOnly(        [0x01, 0x0f],                                       [0x01, 0x0f],               [0x00, 0x1f] ));
        results.push( TestPNTruncation.undoOnly(        [0x00, 0x0f],                                       [0x00, 0x0f],               [0x00, 0x1f] ));

        results.push( TestPNTruncation.undoOnly(        [0x0f, 0xff],                                       [0x0f, 0xff],               [0x00, 0x01] ));
        results.push( TestPNTruncation.undoOnly(        [0x00, 0x02],                                       [0x00, 0x02],               [0x00, 0x01] ));
        results.push( TestPNTruncation.undoOnly(        [0x1, 0x00, 0x01],                                  [0x00, 0x01],               [0x1,  0x00, 0x00] ));
        results.push( TestPNTruncation.undoOnly(        [0xaa, 0x83, 0x09, 0xb3],                           [0x9,  0xb3],               [0xaa, 0x82, 0xf3, 0x0e] ));
        results.push( TestPNTruncation.undoOnly(        [0xa8, 0x2f, 0x9b, 0x32],                           [0x9b, 0x32],               [0xa8, 0x2f, 0x30, 0xea] ));

        // 4 bytes
        results.push( TestPNTruncation.undoOnly(        [0x01, 0x00, 0x94, 0xf3, 0x0e],                     [0x00, 0x94, 0xf3, 0x0e],   [0xaa, 0x82, 0xf3, 0x0e] ));
        results.push( TestPNTruncation.undoOnly(        [0xbd, 0x00, 0x00, 0x00, 0x00],                     [0x00, 0x00, 0x00, 0x00],   [0xbc, 0xaa, 0x82, 0xf3, 0x0e] ));
        results.push( TestPNTruncation.undoOnly(        [0xbc, 0xaa, 0x82, 0xf3, 0x0f],                     [0xaa, 0x82, 0xf3, 0x0f],   [0xbc, 0xaa, 0x82, 0xf3, 0x0e] ));
        
        // TODO: add edge cases for 64-bit and 3 and 4 byte truncated values!
        let result = true;
        for( let entry of results ){
            result = result && entry;
        }

        return result0 && result1 && result2 && result3 && result4 && result5 && result6 && result7 && result8 && result;
    }
}
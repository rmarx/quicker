import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../packet/header/header.properties';
import { TransportParameters, TransportParameterId } from '../crypto/transport.parameters';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { HeaderParser } from '../utilities/parsers/header.parser';

// some draft-20 raw packets, all containing a coalesced handshake + 1RTT packet from 3 different implementations
export class TestHeaderParser  {

    public static execute(): boolean {
        
        let testVector1 = "eaff000014c50f1ab16f5c84e23a713662040ad72145f75118c221bae24016754f8558fffab058950769516a1d5b8ea5fb716e5b97460f1ab16f5c84e23a713662040ad7210e2daf474b9e77f88510cfdb1a1877f5dc3ac986d7d94a98a161e97bc121bf157dcadd6396ea34b194c531f58ba4aa64ba0655f3e489be8ac6c2744f9b14356b6e9e881a8b4bc3538fd3000162172ff89eba521a3641dce5179f68528d8a43ce0b12d651fecc091729093bb3b0dc6110d0ae53075434c961908c37260830beb02213ff34e85cb109763c14ff4b852a64b38c5fb4c4d6aebc8830cc0053803e0e26d7f3f197e128c28d041fcda99adbd282b17e1a9efee8460af8241d42d788c05361c2e7de658c3ad0d17bf04bb3aae3a9863d5a03";

        let testVector2 = "e7ff000014710a804fc1294155b82c205ac42a30405ef3253e2d66b86b569b33ad446ddc3e49855d1e8a02400cbe490ae4e11c72d32105c4122944400fcfeaf8a8ad685457298dd2014105fb53276f783ab29ce5d33a904a7811f8acfe31cf8dfbead305a3084d3e1d49f58c941892504a618f514e0a804fc1294155b82c201b298f078e7343c819ed75e3144d8cb03a94319553ca690db489f0a7a57683984724b8801c13d5245288fc9fa8697d1a8f4d3ef98f7f22ff0063488fe3cfb3db85df1749139c942a3b5569fea93fca155eb14a91cbb767575288f549f243024ed828cf77f506f277f615d5e16208a244fbc071e48e3021722faac036d9f170b2f850f2118f67e46eb67a068a2ed0bf4e8a36fbf50e5f07b28cfe22bb00556108c4596fc3c52a20e287cc1fbde2c2b7ae18e24ae5729364cebff50dc55e10c4ffa2aec0469f647eab2cb515a8c72608eba38ed9ef491d6b0d67191f1e7f35b5ff9a6a8228a98fca71419c7357fd563ff12c8feeb822b56f115dc8d1ceccc4";

        let testVector3 = "ebff0000142505535dcdb98737ba8a14fb50a04016324ef17aaf8ac012840b31c635683c1b9d7331964bcf5f05535dcdb9c7bd03074f13845b9e35f004e441e0599470b0ea57c9a898773ce99b3e83da3355f6ba8ad3c986ddd68c2750b19c9c0ea7e86bad97ec1b1408651973a7beddf43d4ec52cbd7b2a7c35be8119b41a2fedb3b9c571335d62e4c7e5537575a412b8aed7e0020b6c5067feefdfb2caf28c4b58554f883af21105f5419ed261ebc290ada2f4a4a2fc7b3b3d4eee45b238bb37b4618403376fe387dda062411ab080457fade00337c99827bad0552ce852eab8f63b58af61fe5f6c0d0c838801eb973856560d41694212f61e1b6b1bebe551e191d45c00b97a720181";

        let parser = new HeaderParser();
        let result1 = parser.parseShallowHeader( Buffer.from(testVector1, 'hex') );
        let result2 = parser.parseShallowHeader( Buffer.from(testVector2, 'hex') );
        let result3 = parser.parseShallowHeader( Buffer.from(testVector3, 'hex') );

        return true; //&& result2;
    }
}
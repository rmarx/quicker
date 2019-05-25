import { Connection } from '../quicker/connection';
import { EndpointType } from '../types/endpoint.type';
import { Socket, createSocket, SocketType } from 'dgram';
import { Version, ConnectionID } from '../packet/header/header.properties';
import { TransportParameters, TransportParameterId } from '../crypto/transport.parameters';
import { VerboseLogging } from '../utilities/logging/verbose.logging';
import { HeaderParser } from '../utilities/parsers/header.parser';
import { HeaderHandler } from '../utilities/handlers/header.handler';
import { QTLS } from '../crypto/qtls';
import { AEAD } from '../crypto/aead';
import { LongHeader } from '../packet/header/long.header';
import { PacketParser } from '../utilities/parsers/packet.parser';
import { Bignum } from '../types/bignum';
import { Time } from '../types/time';

export class TestHeaderParser  {

    public static execute(): boolean {
        
        // 3 draft-20 raw packets, all containing a coalesced handshake + 1RTT packet from 3 different implementations
        let testVector1 = "eaff000014c50f1ab16f5c84e23a713662040ad72145f75118c221bae24016754f8558fffab058950769516a1d5b8ea5fb716e5b97460f1ab16f5c84e23a713662040ad7210e2daf474b9e77f88510cfdb1a1877f5dc3ac986d7d94a98a161e97bc121bf157dcadd6396ea34b194c531f58ba4aa64ba0655f3e489be8ac6c2744f9b14356b6e9e881a8b4bc3538fd3000162172ff89eba521a3641dce5179f68528d8a43ce0b12d651fecc091729093bb3b0dc6110d0ae53075434c961908c37260830beb02213ff34e85cb109763c14ff4b852a64b38c5fb4c4d6aebc8830cc0053803e0e26d7f3f197e128c28d041fcda99adbd282b17e1a9efee8460af8241d42d788c05361c2e7de658c3ad0d17bf04bb3aae3a9863d5a03";

        let testVector2 = "e7ff000014710a804fc1294155b82c205ac42a30405ef3253e2d66b86b569b33ad446ddc3e49855d1e8a02400cbe490ae4e11c72d32105c4122944400fcfeaf8a8ad685457298dd2014105fb53276f783ab29ce5d33a904a7811f8acfe31cf8dfbead305a3084d3e1d49f58c941892504a618f514e0a804fc1294155b82c201b298f078e7343c819ed75e3144d8cb03a94319553ca690db489f0a7a57683984724b8801c13d5245288fc9fa8697d1a8f4d3ef98f7f22ff0063488fe3cfb3db85df1749139c942a3b5569fea93fca155eb14a91cbb767575288f549f243024ed828cf77f506f277f615d5e16208a244fbc071e48e3021722faac036d9f170b2f850f2118f67e46eb67a068a2ed0bf4e8a36fbf50e5f07b28cfe22bb00556108c4596fc3c52a20e287cc1fbde2c2b7ae18e24ae5729364cebff50dc55e10c4ffa2aec0469f647eab2cb515a8c72608eba38ed9ef491d6b0d67191f1e7f35b5ff9a6a8228a98fca71419c7357fd563ff12c8feeb822b56f115dc8d1ceccc4";

        let testVector3 = "ebff0000142505535dcdb98737ba8a14fb50a04016324ef17aaf8ac012840b31c635683c1b9d7331964bcf5f05535dcdb9c7bd03074f13845b9e35f004e441e0599470b0ea57c9a898773ce99b3e83da3355f6ba8ad3c986ddd68c2750b19c9c0ea7e86bad97ec1b1408651973a7beddf43d4ec52cbd7b2a7c35be8119b41a2fedb3b9c571335d62e4c7e5537575a412b8aed7e0020b6c5067feefdfb2caf28c4b58554f883af21105f5419ed261ebc290ada2f4a4a2fc7b3b3d4eee45b238bb37b4618403376fe387dda062411ab080457fade00337c99827bad0552ce852eab8f63b58af61fe5f6c0d0c838801eb973856560d41694212f61e1b6b1bebe551e191d45c00b97a720181";

        let parser = new HeaderParser();
        let result1 = parser.parseShallowHeader( Buffer.from(testVector1, 'hex') );
        let result2 = parser.parseShallowHeader( Buffer.from(testVector2, 'hex') );
        let result3 = parser.parseShallowHeader( Buffer.from(testVector3, 'hex') );

        // Initial from winquic with a zero-length src ID
        let testVector4 = "c1ff0000145076e3201732a6d8890044d35d8ae129fc9a5e5a7ba749a8391a5c1c02a83b883d0b2709e91a5d0f0cc33e4dae8880c049b0efb7e445a65795892ab73f01babcc552c0f88a2c1e217b44fb9cc3f11275c2fc0d0cc0c4389f0c6c0c9b38812385da730aaf92898bb9a86f3deb599a033a0fc375e204dc31c381ea0a3d883ee0c2f38b78a021b23c0d8cd71c2124fc3aae5702f1034f87bf5f8dd3d01d0b4c1ffcadfce66aff93e047611e3c35435e5a6f6eaf022c42bf50e694d39b94592f66ed7fc57659030868bdb9ff83af412f7509d363b5b48711b25c3d43752e74e5896a1d9f114aa8a761ee6eef44c89d9636cc74922f43d29865232e81933dfdb0b12f6764b7a6b73e1e4645f567bb126cfcc3a66eeeeee62bc513ba0d904200d84ff60d0429f9d31397793e6fe0fe010014bb2527b196f1b7f792243a7e0630c651cbdfa569417bcb543fdad8d3af76edc5fc3a1d3dab6c5c314f10d14ac7419d3a3e1ca7b8ee58d57be268913443522cc0fef050c01c80f377fe0c3d43448524fa881ac44bf936cfc194f7c1d20b47466061756170751d0aa80ac07be88afc940f7a0e72fbf88332f44cc5714cfe2a65087b9a6ab9233a91dce3e0d3518f3a1ced5af1646fd6a5305794fd575c91d3ae9dc924b70e58766a0675dbb7c8b473a15c96ebc63ce054af97c9e644e32676170aab493e851e114f806e3c35ed7c36a5e5da7f5f5630a06eb53ef00611aa6039e250e611bf0fa33294ea3ba487d43cc030076a2e8fab827eecc5ff7a39b79a11416d8bded10404e6c26a73a839240c489ec7d92937657662cecee44446bc0aff1e4329d1823b537db971695ca128e6eab21cd5515d251757f6595a1841ab3ee469140de45a752b93e92cab0361a895b2288f9fbbdd8056a3f5c3ce3927bd2b23fd94937d475b06d60296419bbb94dea298ee05992683d230963c33f68c6b4745b9ba0cf3c4310065e967f8391c4aba13e69e2218409c4baf3898e31a3823d6cca181fa43f7fa5739324c5f10ba2f7c13b09463c528c8b36c9cf1d0e416a3499336ea504a4b7d7eb40b99e4905cb9c9aa707cfc5fc1f33e857e9c819f3ecb345fce97772573c0c33e0c15b3a7bbbedd18eaaf8f92b28468a233c0269bd80fedd4403b3b0814ae74b28390c952cd22bd1052a8476ad429aeb7e64092e1f040ce5b6b6b6c7d63adff5cd61393346b46297221ce0c3823209b7fd123cd4db97b8dcf713bdc854ddf6d3f86ceaed6831335daa4748ad4f3eaf869b3d33116e9fb7819fe4d87561a979d95c32dc11c31c0e2004a7dc730de3d043370b70ddc58b9ff57e277de62c8db5316e3e3f46d17ba8f418d65a9feb7d8f834a91802dc991a7a25dceb098bf4befcd62470f99ddb786e81052062331fdeefbeac5fff0920f1aa0f3ccba08d957ed14a9be259c0fa2cfd65fb8925db3b4fc006e84e7608fe29b024a66fc317f3b5971cf89b85dc2055333b3e052b9378398250da74c00d4f9dfbe224c2591be753a0d9034669f13d88faab03b22f3e36cc1d171445c0ccfe40d1c1af7bcbe9b253a3712e0ead564b7e45b9c2046135a09b26d5158faf773c54e993838a99442001f0c443213dbaf9eeba15eb311e564e331892210ef54aabde1e565fbc0b27f698b7524ad19f7c5b9e8a8baf6aff442de6ddb0bf14ae95c5c7ca55c09e33429803c6dc2b1bbe21054dfe2b59c0953e7ffe6400a8e02a7a1fb198b5a6ea6e466e9e7e80cc0873739c6837897d";

        // test vector from draft-20 : https://tools.ietf.org/html/draft-ietf-quic-tls-20#appendix-A
        let connectionID = new ConnectionID( Buffer.from("8394c8f03e515708", "hex"), "8394c8f03e515708".length / 2 );



        let socket = createSocket( "udp4" );
        socket.bind(undefined, undefined);

        // TODO: allow top-level user to specify an address and port to bind client socket on 
        // look at how Node's HTTP client typically does this 

        setTimeout( () => {
            //aead.generateClearTextSecrets( connectionID, qtls, new Version( Buffer.from("ff000014", "hex")) ); 

            let handler = new HeaderHandler();
            let partialResult4 = parser.parseShallowHeader( Buffer.from(testVector4, 'hex') );

            let scid = (partialResult4[0].header as LongHeader).getSrcConnectionID();
            let dcid = (partialResult4[0].header as LongHeader).getDestConnectionID();
            
            let connection:Connection = new Connection({address: "127.0.0.1", port: 1234, family: ""}, EndpointType.Server, socket, (partialResult4[0].header as LongHeader).getDestConnectionID() );
            let qtls:QTLS = new QTLS(true, {}, connection);
            let aead:AEAD = new AEAD(qtls);

            let intermediateResult4 = handler.decryptHeader( connection, partialResult4[0], EndpointType.Client, Time.now() );
            let fullResult4 = handler.handle( connection, intermediateResult4!, EndpointType.Client );

            let packerParser = new PacketParser()
            let packet4 = packerParser.parse( connection, fullResult4!, EndpointType.Client );

            // let packet4Header = (packet4.getHeader() as longHeader);
            // the header.payloadLength includes the packet number 
            let packetBuffer4 = packet4.toBuffer(connection);

            console.log("PacketBuffer4 " + packetBuffer4.toString('hex') );

            let reverseResult4 = parser.parseShallowHeader( packetBuffer4 );

            let scid2 = (reverseResult4[0].header as LongHeader).getSrcConnectionID();
            let dcid2 = (reverseResult4[0].header as LongHeader).getDestConnectionID();
            
            console.log("Correctly decoded and re-encoded 0-length ConnectionID : " + (scid.getValueForComparison().compare(scid2.getValueForComparison()) === 0) + " ? " + scid.toString() + " // " + scid2.toString());
            console.log("Correctly decoded and re-encoded 8-length ConnectionID : " + (dcid.getValueForComparison().compare(dcid2.getValueForComparison()) === 0) + " ? " + dcid.toString() + " // " + dcid2.toString());

        }, 500);

        return true; //&& result2;
    }
}

TestHeaderParser.execute();
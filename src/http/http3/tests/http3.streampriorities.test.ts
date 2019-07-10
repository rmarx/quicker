import { Http3DependencyTree } from "../common/prioritization/http3.deptree";
import { Client } from "../../../quicker/client";
import { StreamType } from "../../../quicker/stream";
import { QuicStream } from "../../../quicker/quic.stream";
import { QuickerEvent } from "../../../quicker/quicker.event";

export class Http3StreamPriorityTester {
    public static execute() {
        // Start a server before executing
        const client: Client = Client.connect("localhost", 4433);

        client.on(QuickerEvent.CLIENT_CONNECTED, () => {
            const stream1: QuicStream = client.createStream(StreamType.ClientBidi);
            const stream1Data: Buffer = Buffer.alloc(1000);
            stream1Data.fill('1');
            const stream2: QuicStream = client.createStream(StreamType.ClientBidi);
            const stream2Data: Buffer = Buffer.alloc(1000);
            stream2Data.fill('2');
            const stream3: QuicStream = client.createStream(StreamType.ClientBidi);
            const stream3Data: Buffer = Buffer.alloc(1000);
            stream3Data.fill('3');
            const stream4: QuicStream = client.createStream(StreamType.ClientBidi);
            const stream4Data: Buffer = Buffer.alloc(1000);
            stream3Data.fill('4');

            const deptree: Http3DependencyTree = new Http3DependencyTree(1);
            const placeholderID: number = deptree.addPlaceholderToRoot(4);
            deptree.addRequestStreamToPlaceholder(stream1, placeholderID, 2);
            deptree.addRequestStreamToPlaceholder(stream2, placeholderID, 2);
            deptree.addRequestStreamToRoot(stream3, 2);
            deptree.addRequestStreamToRoot(stream4, 8);

            deptree.addData(stream1.getStreamId(), stream1Data);
            deptree.addData(stream2.getStreamId(), stream2Data);
            deptree.addData(stream3.getStreamId(), stream3Data);
            deptree.addData(stream4.getStreamId(), stream4Data);

            for (let i = 0; i < 30; ++i) {
                deptree.schedule();
            }
        });
    }
}
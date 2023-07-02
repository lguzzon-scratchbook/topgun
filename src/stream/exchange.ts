import { AsyncStreamEmitter, StreamDemux } from 'topgun-async-stream-emitter';
import { TGStream } from './stream';
import { TGSimpleStream, TGStreamState } from './types';
import { uuidv4 } from '../utils/uuidv4';

export class TGExchange extends AsyncStreamEmitter<any>
{
    private readonly _streamDataDemux: StreamDemux<any>;
    private readonly _streamEventDemux: StreamDemux<any>;
    private readonly _streamMap: {
        [key: string]: TGSimpleStream
    };

    /**
     * Constructor
     */
    constructor()
    {
        super();
        this._streamMap        = {};
        this._streamEventDemux = new StreamDemux();
        this._streamDataDemux  = new StreamDemux();

        (async () =>
        {
            for await (const { streamName, data } of this.listener('publish'))
            {
                if (this._streamMap[streamName])
                {
                    this._streamDataDemux.write(streamName, data);
                }
            }
        })();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    publish(streamName: string, data: any): Promise<void>
    {
        this.emit('publish', { streamName, data });
        return Promise.resolve();
    }

    // stream(streamName: string): TGStream<any>
    // {
    //     const channelDataStream = this._streamDataDemux.stream(streamName);
    //
    //     return new TGStream(
    //         streamName,
    //         this,
    //         this._streamEventDemux,
    //         channelDataStream
    //     );
    // }

    destroy(streamName?: string): void
    {
        if (streamName)
        {
            const channel = this._streamMap[streamName];

            if (channel)
            {
                this._triggerStreamDestroy(channel);
            }

            this._streamDataDemux.close(streamName);
            this._streamDataDemux.close(streamName);
        }
        else
        {
            Object.keys(this._streamMap).forEach((streamName) =>
            {
                const channel = this._streamMap[streamName];
                this._triggerStreamDestroy(channel);
            });
            this.closeAllListeners();
            this._streamDataDemux.closeAll();
            this._streamEventDemux.closeAll();
        }
    }

    getStreamState(streamName: string): TGStreamState
    {
        const channel = this._streamMap[streamName];
        if (channel)
        {
            return channel.state;
        }
        return TGStream.UNSUBSCRIBED;
    }

    subscribe(streamName: string = uuidv4(), attributes: {[key: string]: any} = {}): TGStream<any>
    {
        let channel = this._streamMap[streamName];

        if (!channel)
        {
            channel                     = {
                name : streamName,
                state: TGStream.PENDING,
                attributes
            };
            this._streamMap[streamName] = channel;
            this._triggerStreamSubscribe(channel);
        }

        const channelDataStream = this._streamDataDemux.stream(streamName);

        return new TGStream(
            streamName,
            this,
            this._streamEventDemux,
            channelDataStream,
            attributes
        );
    }

    unsubscribe(streamName: string): void
    {
        const channel = this._streamMap[streamName];

        if (channel)
        {
            this._triggerStreamUnsubscribe(channel);
        }
    }

    subscriptions(includePending?: boolean): string[]
    {
        const subs = [];
        Object.keys(this._streamMap).forEach((streamName) =>
        {
            if (includePending || this._streamMap[streamName].state === TGStream.SUBSCRIBED)
            {
                subs.push(streamName);
            }
        });
        return subs;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    private _triggerStreamDestroy(stream: TGSimpleStream): void
    {
        const streamName = stream.name;

        stream.state = TGStream.DESTROYED;

        this._streamEventDemux.write(`${streamName}/destroy`, {});
        this.emit('destroy', { streamName });
    }

    private _triggerStreamSubscribe(stream: TGSimpleStream): void
    {
        const streamName = stream.name;

        stream.state = TGStream.SUBSCRIBED;

        this._streamEventDemux.write(`${streamName}/subscribe`, {});
        this.emit('subscribe', { streamName });
    }

    private _triggerStreamUnsubscribe(stream: TGSimpleStream): void
    {
        const streamName = stream.name;

        delete this._streamMap[streamName];
        if (stream.state === TGStream.SUBSCRIBED)
        {
            this._streamEventDemux.write(`${streamName}/unsubscribe`, {});
            this.emit('unsubscribe', { streamName });
        }
    }
}

import type { TGChannel } from '@topgunbuild/socket/channel'
import {
    type SubscribeOptions,
    type TGClientSocket,
    type TGSocketClientOptions,
    create as createSocketClient
} from '@topgunbuild/socket/client'
import { sign } from '../../sea'
import type { TGGet, TGMessage, TGMessageCb, TGPut } from '../../types'
import { uuidv4 } from '../../utils/uuidv4'
import { TGGraphWireConnector } from './graph-wire-connector'

/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
export class TGWebSocketGraphConnector extends TGGraphWireConnector 
{
    readonly client: TGClientSocket
    readonly options: TGSocketClientOptions | undefined

    private readonly _requestChannels: {
        [msgId: string]: TGChannel<any>
    }

    /**
   * Constructor
   */
    constructor(
        opts: TGSocketClientOptions | undefined,
        name = 'TGWebSocketGraphConnector'
    ) 
    {
        super(name)
        this._requestChannels = {}
        this.options = opts
        this.client = createSocketClient(this.options || {})
        this.#onConnect()
        this.#onError()
        ;(async () => 
        {
            for await (const value of this.outputQueue.listener('completed')) 
            {
                this.#onOutputProcessed(value)
            }
        })()
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    async disconnect(): Promise<void> 
    {
        try 
        {
            this.closeAllListeners()
            this.client.disconnect()
        }
        catch (e) 
        {}
    }

    off(msgId: string): TGWebSocketGraphConnector 
    {
        super.off(msgId)
        const channel = this._requestChannels[msgId]

        if (channel) 
        {
            channel.unsubscribe()
            delete this._requestChannels[msgId]
        }

        return this
    }

    get({ msgId, cb, options, once }: TGGet): () => void 
    {
        const soul = options['#']
        msgId = msgId || uuidv4()
        const cbWrap = (msg: TGMessage) => 
        {
            this.ingest([msg])
            if (cb) 
            {
                cb(msg)
            }
            if (once) 
            {
                this.off(msgId)
            }
        }

        this._requestChannels[msgId] = this.subscribeToChannel(
            `topgun/nodes/${soul}`,
            cbWrap,
            {
                data: options
            }
        )

        return super.get({ msgId, cb, options })
    }

    put({ graph, msgId = '', replyTo = '', cb, originators }: TGPut): () => void 
    {
        if (!graph) 
        {
            return () => 
            {}
        }

        msgId = msgId || uuidv4()

        if (cb) 
        {
            const cbWrap = (response: TGMessage) => 
            {
                this.ingest([response])
                this.off(msgId)
                if (cb) 
                {
                    cb(response)
                }
            }

            this._requestChannels[msgId] = this.subscribeToChannel(
                `topgun/@${msgId}`,
                cbWrap
            )

            return super.put({ graph, msgId, replyTo, cb: cbWrap, originators })
        }
        else 
        {
            return super.put({ graph, msgId, replyTo, cb, originators })
        }
    }

    async authenticate(pub: string, priv: string): Promise<void> 
    {
        await this.waitForConnection()
        await this.#doAuth(pub, priv)
        ;(async () => 
        {
            for await (const _event of this.client.listener('connect')) 
            {
                this.#doAuth(pub, priv)
            }
        })()
    }

    publishToChannel(
        channelName: string,
        msg: TGMessage
    ): TGWebSocketGraphConnector 
    {
        const messageId = msg['#']
        const channel = this._requestChannels[messageId]

        if (channel) 
        {
            channel
                .listener('subscribe')
                .once()
                .then(() => 
                {
                    this.client.publish(channelName, msg)
                })
        }
        else 
        {
            this.client.publish(channelName, msg)
        }

        return this
    }

    subscribeToChannel(
        channelName: string,
        cb?: TGMessageCb,
        opts?: SubscribeOptions
    ): TGChannel<any> 
    {
        const channel = this.client.subscribe(channelName, opts)
        this.#onChannelMessage(channel, cb)

        return channel
    }

    rpc<T>(functionName: string, data?: any): Promise<T> 
    {
        return this.client.invoke(functionName, data)
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    async #doAuth(
        pub: string,
        priv: string
    ): Promise<{ channel: string; data: any }> 
    {
        const id = this.client.id
        const timestamp = new Date().getTime()
        const challenge = `${id}/${timestamp}`
        const proof = await sign(challenge, { pub, priv }, { raw: true })

        return this.client.invoke('login', { proof, pub })
    }

    async #onChannelMessage(
        channel: TGChannel<any>,
        cb?: TGMessageCb
    ): Promise<void> 
    {
        for await (const msg of channel) 
        {
            this.ingest([msg])
            if (cb) 
            {
                cb(msg)
            }
        }
    }

    #onOutputProcessed(msg: TGMessage): void 
    {
        if (msg && this.client) 
        {
            const replyTo = msg['@']

            if (replyTo) 
            {
                this.publishToChannel(`topgun/@${replyTo}`, msg)
            }
            else 
            {
                if ('get' in msg) 
                {
                    this.publishToChannel('topgun/get', msg)
                }
                else if ('put' in msg) 
                {
                    this.publishToChannel('topgun/put', msg)
                }
            }
        }
    }

    async #onConnect(): Promise<void> 
    {
        for await (const _event of this.client.listener('connect')) 
        {
            try 
            {
                this.emit('connect', {})
            }
            catch (error) 
            {
                console.error(error)
            }
        }
    }

    async #onError(): Promise<void> 
    {
        for await (const _event of this.client.listener('error')) 
        {
            console.error(
                'Socket Connection Error',
                _event.error.stack,
                _event.error.message
            )
            this.emit('disconnect', {})
        }
    }
}

export function createConnector(
    opts: TGSocketClientOptions | undefined
): TGWebSocketGraphConnector 
{
    return new TGWebSocketGraphConnector(opts)
}

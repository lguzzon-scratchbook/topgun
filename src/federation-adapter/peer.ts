import type { TGSocketClientOptions } from '@topgunbuild/socket/client'
import { TGWebSocketGraphConnector } from '../client/transports/web-socket-graph-connector'
import type { TGExtendedLoggerType } from '../logger'
import { encrypt, work } from '../sea'
import type {
    TGGraphData,
    TGMessage,
    TGMessageCb,
    TGOptionsGet,
    TGOriginators
} from '../types'
import { socketOptionsFromPeer } from '../utils/socket-options-from-peer'

export class TGPeer extends TGWebSocketGraphConnector 
{
    readonly uri: string

    /**
   * Constructor
   */
    constructor(
        private readonly peer: string | TGSocketClientOptions,
        private readonly peerSecretKey: string,
        private readonly logger: TGExtendedLoggerType
    ) 
    {
        super(socketOptionsFromPeer(peer), 'TGPeer')

        this.uri = this.client.transport.uri()
        this.#connectListener(peerSecretKey)
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    isOpen(): boolean 
    {
        return this.client.state === this.client.OPEN
    }

    isAuthenticated(): boolean 
    {
        return this.client.authState === this.client.AUTHENTICATED
    }

    async waitForAuth(): Promise<void> 
    {
        if (this.isAuthenticated()) 
        {
            return
        }

        await this.client.listener('authenticate').once()
    }

    async putInPeer(
        graph: TGGraphData,
        originators: TGOriginators
    ): Promise<TGMessage> 
    {
        return new Promise<TGMessage>((resolve) => 
        {
            this.put({
                graph,
                originators,
                cb: resolve
            })
        })
    }

    async getFromPeer(options: TGOptionsGet): Promise<TGMessage> 
    {
        return new Promise<TGMessage>((resolve) => 
        {
            this.get({
                options,
                cb: resolve
            })
        })
    }

    onChange(cb: TGMessageCb): () => void 
    {
        const channel = this.subscribeToChannel('topgun/changelog', cb)

        return () => 
        {
            channel.unsubscribe()
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    async #connectListener(secret: string): Promise<void> 
    {
        for await (const _ of this.client.listener('connect')) 
        {
            this.logger.debug('Peer is connected')
            try 
            {
                await Promise.all([
                    this.#doAuth(secret),
                    this.client.listener('authenticate').once()
                ])
                this.logger.debug('Peer is auth!')
            }
            catch (e) 
            {
                console.error(e.message)
            }
        }
    }

    async #doAuth(secret: string): Promise<{ channel: string; data: any }> 
    {
        const id = this.client.id
        const timestamp = Date.now()
        const challenge = `${id}/${timestamp}`

        const [hash, data] = await Promise.all([
            work(challenge, secret),
            encrypt(
                JSON.stringify({ peerUri: this.uri }),
                await work(challenge, secret),
                {
                    raw: true
                }
            )
        ])

        return this.client.invoke('peerLogin', { challenge, data })
    }
}

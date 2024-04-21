import { isNotEmptyObject } from '@topgunbuild/typed'
import type { TGExtendedLoggerType } from '../logger'
import type {
    TGGraphAdapter,
    TGGraphData,
    TGOptionsGet,
    TGOriginators,
    TGPartialGraphData
} from '../types'
import type { TGPeer } from './peer'
import type { TGPeers } from './peers'
import type { TGFederatedAdapterOptions } from './types'

export class PeersWriter 
{
    /**
   * Constructor
   */
    constructor(
        private readonly serverName: string,
        private readonly persistence: TGGraphAdapter,
        private readonly peers: TGPeers,
        private readonly options: TGFederatedAdapterOptions,
        private readonly logger: TGExtendedLoggerType
    ) 
    {}

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    async updatePeers(
        data: TGGraphData,
        peers: TGPeer[],
        originators: TGOriginators
    ): Promise<void> 
    {
        if (peers.length > 0) 
        {
            originators = originators || {}
            originators[this.serverName] = 1

            await Promise.all(
                peers.map(peer =>
                    peer.putInPeer(data, originators).catch((err) => 
                    {
                        this.logger.warn(
                            'Failed to update peer',
                            peer.uri,
                            err.stack || err,
                            data
                        )
                    })
                )
            )
        }
    }

    async updateFromPeers(getOpts: TGOptionsGet): Promise<void> 
    {
        if (this.peers.size > 0) 
        {
            await Promise.all(
                this.peers
                    .getPeers()
                    .filter(peer => peer.isConnected && peer.isOpen)
                    .map(peer => this.#updateFromPeer(peer.uri, getOpts))
            )
        }
    }

    async put(
        graph: TGPartialGraphData,
        currentPeerUri: string,
        originators: TGOriginators
    ): Promise<void> 
    {
        if (isNotEmptyObject(graph)) 
        {
            const diff = await this.persistence.put(graph)

            if (diff) 
            {
                if (this.options.putToPeers) 
                {
                    const otherPeers = this.peers.getOtherPeers(currentPeerUri)
                    this.updatePeers(diff, otherPeers, originators)
                }
            }
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    async #updateFromPeer(
        currentPeerUri: string,
        getOpts: TGOptionsGet
    ): Promise<void> 
    {
        const peer = this.peers.get(currentPeerUri)
        const message = await peer.getFromPeer(getOpts)

        try 
        {
            await this.put(message.put, currentPeerUri, message.originators)
        }
        catch (e) 
        {
            this.logger.error('Error updating from peer', {
                error  : e.stack,
                peerUri: currentPeerUri
            })
        }
    }
}

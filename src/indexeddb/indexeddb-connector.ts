import { TGGraphConnectorFromAdapter } from '../client/transports/graph-connector-from-adapter'
import type { TGGraphAdapterOptions } from '../types'
import { createIndexedDBAdapter } from './indexeddb-adapter'

export class TGIndexedDBConnector extends TGGraphConnectorFromAdapter 
{
    constructor(storageKey?: string, adapterOptions?: TGGraphAdapterOptions) 
    {
        super(
            createIndexedDBAdapter(storageKey, adapterOptions),
            'TGIndexedDBConnector'
        )
    }
}

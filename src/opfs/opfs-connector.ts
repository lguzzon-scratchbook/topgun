import { TGGraphConnectorFromAdapter } from '../client/transports/graph-connector-from-adapter'
import type { TGGraphAdapterOptions } from '../types'
import { createOPFSAdapter } from './opfs-adapter'

export class TGOPFSConnector extends TGGraphConnectorFromAdapter 
{
    constructor(storageKey?: string, adapterOptions?: TGGraphAdapterOptions) 
    {
        super(createOPFSAdapter(storageKey, adapterOptions), 'TGOPFSConnector')
    }
}

import { createGraphAdapter } from '../storage/adapter'
import type { TGGraphAdapter, TGGraphAdapterOptions } from '../types'
import { OPFSStorage } from './opfs-storage'

const DEFAULT_DIR_NAME = 'topgun-nodes'

export function createOPFSAdapter(
    name = DEFAULT_DIR_NAME,
    adapterOptions?: TGGraphAdapterOptions
): TGGraphAdapter 
{
    return createGraphAdapter(new OPFSStorage(name), adapterOptions)
}

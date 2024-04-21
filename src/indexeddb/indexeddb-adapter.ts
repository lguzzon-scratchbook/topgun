import { createGraphAdapter } from '../storage/adapter'
import type { TGGraphAdapter, TGGraphAdapterOptions } from '../types'
import { IndexedDBStorage } from './indexeddb-storage'

const DEFAULT_DB_NAME = 'topgun-nodes'

export function createIndexedDBAdapter(
    name = DEFAULT_DB_NAME,
    adapterOptions?: TGGraphAdapterOptions
): TGGraphAdapter 
{
    return createGraphAdapter(new IndexedDBStorage(name), adapterOptions)
}

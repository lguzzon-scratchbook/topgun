import { createGraphAdapter } from '../storage/adapter'
import type { TGGraphAdapter, TGGraphAdapterOptions } from '../types'
import { MemoryStorage } from './memory-storage'

export function createMemoryAdapter(
    adapterOptions?: TGGraphAdapterOptions
): TGGraphAdapter 
{
    return createGraphAdapter(new MemoryStorage(), adapterOptions)
}

export { MemoryStorage } from './memory-storage'

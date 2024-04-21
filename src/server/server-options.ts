import type { TGSocketServerOptions } from '@topgunbuild/socket/server'
import type { TGLoggerOptions } from '../logger'
import type {
    TGGraphAdapter,
    TGGraphAdapterOptions,
    TGPeerOptions
} from '../types'

export interface TGServerOptions
    extends TGSocketServerOptions,
    TGGraphAdapterOptions {
    disableGraphValidation?: boolean
    adapter?: TGGraphAdapter
    port?: number
    log?: TGLoggerOptions | boolean
    serverName?: string
    peers?: TGPeerOptions[]
    putToPeers?: boolean
    reversePeerSync?: boolean
    peerSecretKey?: string
    httpServer?: any
}

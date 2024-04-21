import type {
    TGGraphAdapterOptions,
    TGPeerOptions,
    TGSupportedStorage
} from '../types'
import type { TGGraphConnector } from './transports/graph-connector'

export interface TGClientOptions extends TGGraphAdapterOptions {
    peers?: TGPeerOptions[]
    connectors?: TGGraphConnector[]
    localStorage?: boolean
    localStorageKey?: string
    sessionStorage?: TGSupportedStorage | boolean
    sessionStorageKey?: string
    passwordMinLength?: number
    passwordMaxLength?: number
    transportMaxKeyValuePairs?: number
}

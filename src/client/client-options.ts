import type {
    TGGraphAdapterOptions,
    TGPeerOptions,
    TGSupportedStorage
} from '../types'
import type { TGGraphConnector } from './transports/graph-connector'

/**
 * Interface for TGClient options
 */
export interface TGClientOptions extends TGGraphAdapterOptions {
    peers?: TGPeerOptions[] // Optional list of peer options
    connectors?: TGGraphConnector[] // Optional list of graph connectors
    localStorage?: boolean // Flag to enable or disable local storage
    localStorageType?: string // If not defined or null Standard used (indexedDB) otherwise by value    localStorageKey?: string // Key for local storage
    localStorageKey?: string // Key for local storage
    sessionStorage?: TGSupportedStorage | boolean // Session storage support
    sessionStorageKey?: string // Key for session storage
    passwordMinLength?: number // Minimum length for passwords
    passwordMaxLength?: number // Maximum length for passwords
    transportMaxKeyValuePairs?: number // Max key-value pairs in transport
}

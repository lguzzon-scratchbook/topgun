import { isFunction, isObject, isString } from '@topgunbuild/typed'
import { authenticate, createUser, graphSigner } from '../sea'
import type { AuthOptions } from '../sea/authenticate'
import type { Pair } from '../sea/pair'
import type {
    TGAuthCallback,
    TGOptionsPut,
    TGSupportedStorage,
    TGUserCredentials,
    TGUserReference
} from '../types'
import { assertCredentials, assertNotEmptyString } from '../utils/assert'
import { isValidCredentials } from '../utils/is-valid-credentials'
import {
    getItemAsync,
    removeItemAsync,
    setItemAsync
} from '../utils/storage-helpers'
import type { TGClient } from './client'
import type { TGLink } from './link/link'

let sessionStorage: TGSupportedStorage
let sessionStorageKey: string

export class TGUserApi 
{
    readonly #client: TGClient
    #signMiddleware?: (
        graph: any,
        existingGraph: any,
        putOpt?: TGOptionsPut
    ) => Promise<any>
    is?: TGUserReference

    /**
   * Constructor
   */
    constructor(
        client: TGClient,
        _sessionStorage: TGSupportedStorage,
        _sessionStorageKey: string | undefined
    ) 
    {
        this.#client = client
        sessionStorage = _sessionStorage
        sessionStorageKey = _sessionStorageKey ?? ''
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
   * Creates a new user and calls callback upon completion.
   */
    async create(
        alias: string,
        password: string,
        cb?: TGAuthCallback
    ): Promise<TGUserCredentials> 
    {
        try 
        {
            const credentials = await createUser(this.#client, alias, password)
            await this.useCredentials(credentials)
            cb?.(credentials)
            return credentials
        }
        catch (err) 
        {
            const error = { err: err as Error }
            cb?.(error)
            throw err
        }
    }

    /**
   * Authenticates a user, previously created via User.create.
   */
    async auth(
        aliasOrPair: string | Pair,
        passwordOrCallback: string | TGAuthCallback,
        optionsOrCallback?: TGAuthCallback | AuthOptions,
        maybeOptions?: AuthOptions
    ): Promise<TGUserCredentials | undefined> 
    {
        const cb = isFunction(optionsOrCallback)
            ? optionsOrCallback
            : isFunction(passwordOrCallback)
                ? passwordOrCallback
                : null

        try 
        {
            await this.recoverCredentials()

            if (isObject(aliasOrPair) && (aliasOrPair.pub || aliasOrPair.epub)) 
            {
                const credentials = await authenticate(
                    this.#client,
                    aliasOrPair as Pair,
                    optionsOrCallback as AuthOptions
                )
                await this.useCredentials(credentials)
                cb?.(credentials)
                return credentials
            }

            if (isString(aliasOrPair) && isString(passwordOrCallback)) 
            {
                const credentials = await authenticate(
                    this.#client,
                    aliasOrPair,
                    passwordOrCallback,
                    maybeOptions
                )
                await this.useCredentials(credentials)
                cb?.(credentials)
                return credentials
            }
        }
        catch (err) 
        {
            const error = { err: err as Error }
            cb?.(error)
            throw err
        }
    }

    /**
   * Log out currently authenticated user
   */
    leave(): TGUserApi 
    {
        if (this.#signMiddleware) 
        {
            if (this.is?.alias) 
            {
                this.#client.emit('leave', { alias: this.is.alias, pub: this.is.pub })
            }
            this.#removeCredentials()
            this.is = undefined
        }
        return this
    }

    /**
   * Traverse a location in the graph
   */
    get(soul: string): TGLink 
    {
        const safeSoul = assertNotEmptyString(soul)
        return this.is
            ? this.#client.get(`~${this.is.pub}`).get(safeSoul)
            : this.#client.get(`~${this.#client.WAIT_FOR_USER_PUB}`).get(safeSoul)
    }

    /**
   * Recovers the credentials from LocalStorage
   */
    async recoverCredentials(): Promise<void> 
    {
        if (sessionStorage) 
        {
            const maybeSession = await getItemAsync(sessionStorage, sessionStorageKey)
            if (maybeSession !== null && isValidCredentials(maybeSession)) 
            {
                await this.useCredentials(maybeSession)
            }
            else 
            {
                await this.#removeCredentials()
            }
        }
    }

    /**
   * Authenticates a user by credentials
   */
    async useCredentials(
        credentials: TGUserCredentials
    ): Promise<{ readonly alias: string; readonly pub: string }> 
    {
        const validCredentials = assertCredentials(credentials)
        this.leave()
        this.#signMiddleware = graphSigner(this.#client, {
            priv: validCredentials.priv,
            pub : validCredentials.pub
        })
        this.#client.graph.use(this.#signMiddleware, 'write')
        this.is = { alias: validCredentials.alias, pub: validCredentials.pub }

        if (this.is?.pub) 
        {
            await this.#authSuccess(validCredentials)
        }

        return this.is
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    async #authSuccess(credentials: TGUserCredentials): Promise<void> 
    {
        await Promise.all([
            this.#authConnectors(credentials),
            this.#persistCredentials(credentials)
        ])
        this.#client.emit('auth', {
            alias: credentials.alias,
            pub  : credentials.pub
        })
    }

    async #authConnectors(credentials: TGUserCredentials): Promise<void> 
    {
        await this.#client.graph.eachConnector(async (connector) => 
        {
            if (isFunction(connector?.authenticate)) 
            {
                await connector.authenticate(credentials.pub, credentials.priv)
            }
        })
    }

    async #persistCredentials(credentials: TGUserCredentials): Promise<void> 
    {
        if (sessionStorage) 
        {
            await setItemAsync(sessionStorage, sessionStorageKey, credentials)
        }
    }

    async #removeCredentials(): Promise<void> 
    {
        if (sessionStorage) 
        {
            await removeItemAsync(sessionStorage, sessionStorageKey)
        }
    }
}

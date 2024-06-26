import { AsyncStreamEmitter } from '@topgunbuild/async-stream-emitter'
import { type TGSocketServer, attach, listen } from '@topgunbuild/socket/server'
import {
    type Result,
    type Struct,
    isBoolean,
    isDefined,
    isErr,
    isFunction,
    isObject,
    isString,
    ok
} from '@topgunbuild/typed'
import { TGFederationAdapter } from '../federation-adapter/federation-adapter'
import { TGPeers } from '../federation-adapter/peers'
import { type TGLoggerType, createLogger } from '../logger'
import { defaultLoggerOptions } from '../logger/constants'
import { createMemoryAdapter } from '../memory-adapter'
import { pseudoRandomText } from '../sea'
import { MAX_KEY_SIZE, MAX_VALUE_SIZE } from '../storage'
import type {
    TGGraphAdapter,
    TGGraphData,
    TGMessage,
    TGOriginators,
    TGPartialNode
} from '../types'
import { uuidv4 } from '../utils/uuidv4'
import { createValidator } from '../validator'
import { TGBroker } from './broker'
import { Listeners } from './listeners'
import { Middleware } from './middleware'
import type { TGServerOptions } from './server-options'

export class TGServer extends AsyncStreamEmitter<any> 
{
    name: string
    readonly adapter: TGFederationAdapter
    readonly internalAdapter: TGGraphAdapter
    readonly gateway: TGSocketServer
    readonly options: TGServerOptions
    readonly middleware: Middleware
    readonly peers: TGPeers
    readonly validator: Struct<TGGraphData>
    readonly listeners: Listeners

    private logger: TGLoggerType
    private peersDisconnector: () => void

    /**
   * Constructor
   */
    constructor(options?: TGServerOptions) 
    {
        super()
        const defaultOptions: TGServerOptions = {
            brokerEngine          : new TGBroker(),
            maxKeySize            : MAX_KEY_SIZE,
            maxValueSize          : MAX_VALUE_SIZE,
            disableGraphValidation: false,
            peers                 : [],
            putToPeers            : true,
            reversePeerSync       : true,
            peerSecretKey         : 'peerSecretKey',
            log                   : {
                enabled: true
            }
        }

        this.options = Object.assign(defaultOptions, options || {})

        if (this.options.httpServer) 
        {
            this.gateway = attach(this.options.httpServer, this.options)
            this.gateway.httpServer = this.options.httpServer
        }
        else 
        {
            this.gateway = listen(this.options.port, this.options)
        }

        this.#persistServerName()
        this.#createLogger()

        this.validator = createValidator()
        this.internalAdapter = this.options.adapter || createMemoryAdapter(options)
        this.peers = new TGPeers(
            this.options.peers,
            this.options.peerSecretKey,
            this.logger.extend('Peers')
        )
        this.adapter = this.#federateInternalAdapter(this.internalAdapter)
        this.middleware = new Middleware(
            this.name,
            this.gateway,
            this.options,
            this.adapter,
            this.logger.extend('Middleware')
        )
        this.listeners = new Listeners(
            this.gateway,
            this.logger,
            this.options,
            this.name
        )
        this.#run()
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    waitForReady(): Promise<void> 
    {
        return this.gateway.listener('ready').once()
    }

    waitForPeersAuth(): Promise<void[]> 
    {
        return this.peers.waitForAuth()
    }

    async close(): Promise<void> 
    {
        this.listeners.close()
        if (isFunction(this.gateway.httpServer?.close)) 
        {
            this.gateway.httpServer.close()
        }
        await this.gateway.close()
        this.peersDisconnector()
        await this.peers.disconnect()
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
   * Run server
   */
    #run(): void 
    {
        this.middleware.setupMiddleware()
        this.listeners.createListeners()
        this.peersDisconnector = this.adapter.connectToPeers()
    }

    /**
   * Wrap internal adapter
   */
    #federateInternalAdapter(adapter: TGGraphAdapter): TGFederationAdapter 
    {
        const withPublish: TGGraphAdapter = {
            ...adapter,
            put: async (graph: TGGraphData, originators?: TGOriginators) => 
            {
                const diff = await adapter.put(graph)

                if (diff) 
                {
                    this.#publishIsDiff({
                        '#'  : pseudoRandomText(),
                        'put': diff,
                        originators
                    })
                }

                return diff
            }
        }

        const withValidation = {
            ...withPublish,
            put: async (graph: TGGraphData, originators?: TGOriginators) => 
            {
                const result = this.#validatePut(graph)

                if (isErr(result)) 
                {
                    throw result.error
                }

                return withPublish.put(graph, originators)
            }
        }

        return new TGFederationAdapter(
            this.name,
            withPublish,
            this.peers,
            withValidation,
            {
                putToPeers     : this.options.putToPeers,
                reversePeerSync: this.options.reversePeerSync
            },
            this.logger.extend('FederationAdapter')
        )
    }

    /**
   * Send put data to node subscribers as a diff
   */
    #publishIsDiff(msg: TGMessage): void 
    {
        const msgId = msg['#'] || uuidv4()
        const diff = msg.put
        const originators = msg.originators

        if (!diff) 
        {
            return
        }

        for (const soul in diff) 
        {
            if (!soul) 
            {
                continue
            }

            const nodeDiff = diff[soul]

            // if (!nodeDiff)
            // {
            //     continue;
            // }

            this.#publishDiff(soul, msgId, nodeDiff, originators)
        }
    }

    /**
   * Send put data to all node subscribers
   */
    #publishDiff(
        soul: string,
        msgId: string,
        nodeDiff: TGPartialNode,
        originators?: Record<string, number>
    ): void 
    {
        const message: TGMessage = {
            '#'  : `${msgId}/${soul}`,
            'put': {
                [soul]: nodeDiff
            },
            'originators': {
                ...(originators || {}),
                [this.name]: 1
            }
        }

        this.gateway.exchange.publish(`topgun/nodes/${soul}`, message)
        this.listeners.publishChangeLog(message)
    }

    /**
   * Validate put operation
   */
    #validatePut(graph: TGGraphData): Result<TGGraphData> 
    {
        if (this.options.disableGraphValidation) 
        {
            return ok(graph)
        }
        return this.validator(graph)
    }

    #createLogger(): void 
    {
        if (isBoolean(this.options.log)) 
        {
            this.options.log = {
                enabled: this.options.log
            }
        }
        else if (!isObject(this.options.log)) 
        {
            this.options.log = defaultLoggerOptions
        }
        if (!isDefined(this.options.log.appId) && isString(this.name)) 
        {
            this.options.log.appId = this.name
        }
        this.logger = createLogger(this.options.log)
    }

    #persistServerName(): void 
    {
        this.name = this.options.serverName

        if (!isString(this.options.serverName)) 
        {
            if (isFunction(this.gateway.httpServer?.address)) 
            {
                const address = this.gateway.httpServer?.address()

                if (address?.address && address?.port) 
                {
                    this.name = address.address + address.port
                }
                else if (this.options.port) 
                {
                    this.name = String(this.options.port)
                }
            }
        }
        if (!isString(this.options.serverName)) 
        {
            this.name = pseudoRandomText(8)
        }
    }
}

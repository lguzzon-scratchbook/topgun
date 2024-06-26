import { AsyncStreamEmitter } from '@topgunbuild/async-stream-emitter'
import { isDefined, isUndefined } from '@topgunbuild/typed'
import { addMissingState, mergeNodes } from '../../crdt'
import { TGStream } from '../../stream/stream'
import type {
    TGGet,
    TGGraphData,
    TGMessageCb,
    TGMiddleware,
    TGMiddlewareType,
    TGOnCb,
    TGOptionsGet,
    TGOptionsPut,
    TGValue
} from '../../types'
import { getNodeSoul, isRefNode } from '../../utils/node'
import { stringifyOptionsGet } from '../../utils/stringify-options-get'
import { uuidv4 } from '../../utils/uuidv4'
import type { TGGraphConnector } from '../transports/graph-connector'
import { TGGraphQuery } from './graph-query'
import {
    diffSets,
    flattenGraphData,
    getNodesFromGraph,
    getPathData
} from './graph-utils'

interface TGGraphOptions {
    readonly mutable?: boolean
}

/**
 * High level management of a subset of the graph
 *
 * Provides facilities for querying and writing to graph data from one or more sources
 */
export class TGGraph extends AsyncStreamEmitter<any> 
{
    readonly id: string

    activeConnectors: number
    readonly connectors: TGGraphConnector[]

    private _opt: TGGraphOptions
    private readonly _readMiddleware: TGMiddleware[]
    private readonly _writeMiddleware: TGMiddleware[]
    private readonly _graph: TGGraphData
    private readonly _queries: {
        [queryString: string]: TGGraphQuery
    }
    private readonly rootEventEmitter: AsyncStreamEmitter<any>

    /**
   * Constructor
   */
    constructor(rootEventEmitter: AsyncStreamEmitter<any>) 
    {
        super()
        this.id = uuidv4()
        this.activeConnectors = 0
        this._opt = {}
        this._graph = {}
        this._queries = {}
        this.connectors = []
        this._readMiddleware = []
        this._writeMiddleware = []
        this.rootEventEmitter = rootEventEmitter

        this.receiveGraphData = this.receiveGraphData.bind(this)
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    get state(): TGGraphData 
    {
        return this._graph
    }

    set state(value: TGGraphData) 
    {
        throw new Error('Cannot directly set graph state')
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
   * Configure graph options
   */
    opt(options: TGGraphOptions): TGGraph 
    {
        this._opt = { ...this._opt, ...options }
        return this
    }

    /**
   * Connect to a source/destination for graph data
   *
   * @param connector the source or destination for graph data
   */
    connect(connector: TGGraphConnector): TGGraph 
    {
        if (!this.connectors.includes(connector)) 
        {
            this.connectors.push(connector.connectToGraph(this))
            this.#setupConnectorListeners(connector)
            if (connector.isConnected) 
            {
                this.activeConnectors++
            }
        }
        return this
    }

    clear(): void 
    {
        for (const key in this._graph) 
        {
            delete this._graph[key]
        }
        for (const key in this._queries) 
        {
            this._queries[key].destroy()
        }
    }

    /**
   * Disconnect from a source/destination for graph data
   *
   * @param connector the source or destination for graph data
   */
    disconnect(connector: TGGraphConnector): TGGraph 
    {
        const idx = this.connectors.indexOf(connector)
        if (idx !== -1) 
        {
            this.connectors.splice(idx, 1)
            connector.closeAllListeners()
            if (connector.isConnected) 
            {
                this.activeConnectors--
            }
        }
        return this
    }

    /**
   * Register graph middleware
   *
   * @param middleware The middleware function to add
   * @param kind optionally register write middleware instead of read by passing "write"
   */
    use(middleware: TGMiddleware, kind: TGMiddlewareType = 'read'): TGGraph 
    {
        const targetMiddleware =
      kind === 'read' ? this._readMiddleware : this._writeMiddleware
        targetMiddleware.push(middleware)
        return this
    }

    /**
   * Unregister graph middleware
   *
   * @param middleware The middleware function to remove
   * @param kind optionally unregister write middleware instead of read by passing "write"
   */
    unuse(middleware: TGMiddleware, kind: TGMiddlewareType = 'read'): TGGraph 
    {
        const targetMiddleware =
      kind === 'read' ? this._readMiddleware : this._writeMiddleware
        const idx = targetMiddleware.indexOf(middleware)
        if (idx !== -1) 
        {
            targetMiddleware.splice(idx, 1)
        }
        return this
    }

    /**
   * Read a matching nodes from the graph
   */
    queryMany<T extends TGValue>(
        opts: TGOptionsGet,
        cb: TGOnCb<T>,
        msgId: string,
        askOnce?: boolean
    ): () => void 
    {
        const queryString = stringifyOptionsGet(opts)
        const stream = this.#createQueryStream(queryString, cb, msgId, askOnce)
        const query = this.#getQuery(queryString)

        for (const node of getNodesFromGraph(opts, this._graph)) 
        {
            if (isRefNode(node)) 
            {
                query.setRef(node)
                const refSoul = node['#']
                if (this._graph.hasOwnProperty(refSoul)) 
                {
                    cb(this._graph[refSoul] as T)
                }
            }
            else 
            {
                cb(node as T, getNodeSoul(node))
            }
        }

        return () => this.unlisten(queryString, stream)
    }

    /**
   * Read a potentially multi-level deep path from the graph
   */
    query<T extends TGValue>(
        path: string[],
        cb: TGOnCb<T>,
        msgId: string,
        askOnce?: boolean
    ): () => void 
    {
        let currentValue: TGValue | undefined
        let lastSouls = [] as string[]
        const streamMap = new Map<string, TGStream<any>>()

        const updateQuery = () => 
        {
            const { souls, value, complete } = getPathData(path, this._graph)
            const [added] = diffSets(lastSouls, souls)

            if (
                (complete && isUndefined(currentValue)) ||
        (isDefined(value) && value !== currentValue)
            ) 
            {
                currentValue = value
                cb(value as T, path[path.length - 1])
            }

            for (const soul of added) 
            {
                const stream = this.#createQueryStream(
                    this.queryStringForSoul(soul),
                    updateQuery,
                    msgId,
                    askOnce
                )
                streamMap.set(soul, stream)
            }

            lastSouls = souls
        }

        updateQuery()

        return () => 
        {
            for (const soul of streamMap.keys()) 
            {
                this.unlisten(this.queryStringForSoul(soul), streamMap.get(soul))
            }
            streamMap.clear()
        }
    }

    /**
   * Request node data
   */
    get(data: TGGet): () => void 
    {
        const msgId = data.msgId || uuidv4()
        this.emit('get', { ...data, msgId })
        return () => this.emit('off', msgId)
    }

    /**
   * Write graph data to a potentially multi-level deep path in the graph
   */
    putPath(
        fullPath: string[],
        data: TGValue,
        cb?: TGMessageCb,
        putOpt?: TGOptionsPut
    ): void 
    {
        if (!fullPath.length) 
        {
            const err = new Error('No path specified')
            if (cb) 
            {
                cb({
                    '#'  : undefined,
                    '@'  : '',
                    'err': err,
                    'ok' : false
                })
            }
            throw err
        }

        const { graphData, soul } = flattenGraphData(data, [...fullPath])
        this.put(graphData, cb, soul, putOpt)
    }

    /**
   * Write node data. Returns a function to clean up listeners when done
   */
    put(
        data: TGGraphData,
        cb?: TGMessageCb,
        soul?: string,
        putOpt?: TGOptionsPut,
        msgId?: string
    ): () => void 
    {
        let diff: TGGraphData = addMissingState(data)
        const id = msgId || uuidv4()
    ;(async () => 
        {
            for (const fn of this._writeMiddleware) 
            {
                if (!diff) 
                {
                    return
                }
                diff = await fn(diff, this._graph, putOpt)
            }

            if (!diff) 
            {
                return
            }

            await this.receiveGraphData(diff)
            this.emit('put', { cb, graph: diff, msgId: id })

            if (cb) 
            {
                cb({
                    '#'  : soul,
                    '@'  : msgId,
                    'err': null,
                    'ok' : true
                })
            }
        })()

        return () => this.emit('off', id)
    }

    /**
   * Invoke callback function for each connector to this graph
   */
    async eachConnector(
        cb: (connector: TGGraphConnector) => void
    ): Promise<TGGraph> 
    {
        for (const connector of this.connectors) 
        {
            await cb(connector)
        }
        return this
    }

    /**
   * Update graph data in this chain from some local or external source
   */
    async receiveGraphData(
        data?: TGGraphData,
        id?: string,
        replyToId?: string
    ): Promise<void> 
    {
        let diff = data

        // Pass received data through read middleware
        for (const fn of this._readMiddleware) 
        {
            if (!diff) 
            {
                return
            }
            diff = await fn(diff, this._graph)
        }

        if (!diff) 
        {
            return
        }

        const targetMap = new Map()

        for (const soul in diff) 
        {
            if (!soul) 
            {
                continue
            }

            const node = (this._graph[soul] = mergeNodes(
                this._graph[soul],
                diff[soul],
                this._opt.mutable ? 'mutable' : 'immutable'
            ))

            targetMap.set(soul, node)

            this.#eachQuery((query) => 
            {
                if (query.match(soul)) 
                {
                    if (isRefNode(node)) 
                    {
                        // Save reference
                        query.setRef(node)
                        const refSoul = node['#']

                        // Query target node
                        if (!query.streamMap.has(refSoul)) 
                        {
                            const stream = this.#createQueryStream(
                                this.queryStringForSoul(refSoul)
                            )
                            query.streamMap.set(refSoul, stream)
                        }

                        // Get target node from diff
                        if (targetMap.has(refSoul)) 
                        {
                            query.receiveTarget(targetMap.get(refSoul), soul)
                        }
                        // Get target node from graph
                        else if (
                            !diff.hasOwnProperty(refSoul) &&
              this._graph.hasOwnProperty(refSoul)
                        ) 
                        {
                            query.receiveTarget(this._graph[refSoul], soul)
                        }
                    }
                    else 
                    {
                        // Receive base node
                        query.receive(node, soul)
                    }
                }
                else if (query.isTarget(soul)) 
                {
                    // Receive target node
                    const parentSoul = query.targetNodesMap.get(soul)
                    query.receiveTarget(node, parentSoul)
                }
            })
        }

        targetMap.clear()
        this.emit('graphData', { diff, id, replyToId })
    }

    /**
   * Unsubscribe from receiving data for this request
   */
    unlisten(queryString: string, stream: TGStream<any>): TGGraph 
    {
        if (stream instanceof TGStream) 
        {
            stream.destroy()
        }
        const query = this._queries[queryString]
        if (query instanceof TGGraphQuery && query.listenerCount() <= 0) 
        {
            // Destroy a query handler if it has no subscribers
            query.off()
            delete this._queries[queryString]
        }
        return this
    }

    /**
   * Convert soul based get parameters to string
   */
    queryStringForSoul(soul: string): string 
    {
        return stringifyOptionsGet({ ['#']: soul })
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
   * Get handler for query
   */
    #getQuery(queryString: string): TGGraphQuery 
    {
        return (this._queries[queryString] =
      this._queries[queryString] ||
      new TGGraphQuery(this, queryString, this.receiveGraphData))
    }

    /**
   * Create a new data stream for query
   */
    #createQueryStream<T extends TGValue>(
        queryString: string,
        cb?: TGOnCb<T>,
        msgId?: string,
        askOnce?: boolean
    ): TGStream<any> 
    {
        return this.#getQuery(queryString).getStream(cb, msgId, askOnce)
    }

    /**
   * Loop through each query handler
   */
    async #eachQuery(cb: (query: TGGraphQuery) => void): Promise<TGGraph> 
    {
        for (const query of Object.values(this._queries)) 
        {
            await cb(query)
        }
        return this
    }

    /**
   * Update active connector counter
   */
    #onConnectorStatus(connected?: boolean): void 
    {
        this.activeConnectors += connected ? 1 : -1
    }

    /**
   * Setting up listeners for the connector
   */
    #setupConnectorListeners(connector: TGGraphConnector): void 
    {
        ;(async () => 
        {
            for await (const _ of connector.listener('connect')) 
            {
                this.#onConnectorStatus(true)
                this.rootEventEmitter.emit('connectorConnected', connector)
            }
        })()
        ;(async () => 
        {
            for await (const _ of connector.listener('disconnect')) 
            {
                this.#onConnectorStatus(false)
                this.rootEventEmitter.emit('connectorDisconnected', connector)
            }
        })()
        ;(async () => 
        {
            for await (const { data, id, replyToId } of connector.listener(
                'graphData'
            )) 
            {
                this.receiveGraphData(data, id, replyToId)
            }
        })()
    }
}

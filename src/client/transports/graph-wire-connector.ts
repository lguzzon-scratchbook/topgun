import type { TGGet, TGMessage, TGMessageCb, TGPut } from '../../types'
import { uuidv4 } from '../../utils/uuidv4'
import { TGGraphConnector } from './graph-connector'

export class TGGraphWireConnector extends TGGraphConnector 
{
    private readonly _callbacks: {
        [msgId: string]: TGMessageCb
    }

    /**
   * Constructor
   */
    constructor(name = 'GraphWireConnector') 
    {
        super(name)
        this._callbacks = {}
        ;(async () => 
        {
            for await (const value of this.inputQueue.listener('completed')) 
            {
                this.#onProcessedInput(value)
            }
        })()
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    off(msgId: string): TGGraphWireConnector 
    {
        super.off(msgId)
        delete this._callbacks[msgId]
        return this
    }

    /**
   * Send graph data for one or more nodes
   *
   * @returns A function to be called to clean up callback listeners
   */
    put({ graph, msgId = '', replyTo = '', cb, originators }: TGPut): () => void 
    {
        if (!graph) 
        {
            return () => 
            {}
        }
        const msg: TGMessage = {
            put: graph,
            originators
        }
        if (msgId) 
        {
            msg['#'] = msgId
        }
        if (replyTo) 
        {
            msg['@'] = replyTo
        }

        return this.req(msg, cb)
    }

    /**
   * Request data for a given soul
   *
   * @returns A function to be called to clean up callback listeners
   */
    get({ cb, msgId = '', options }: TGGet): () => void 
    {
        const msg: TGMessage = { get: options }
        if (msgId) 
        {
            msg['#'] = msgId
        }

        return this.req(msg, cb)
    }

    /**
   * Send a message that expects responses via @
   *
   * @param msg
   * @param cb
   */
    req(msg: TGMessage, cb?: TGMessageCb): () => void 
    {
        const reqId = (msg['#'] = msg['#'] || uuidv4())
        if (cb) 
        {
            this._callbacks[reqId] = cb
        }
        this.send([msg])
        return () => 
        {
            this.off(reqId)
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    #onProcessedInput(msg?: TGMessage): void 
    {
        if (!msg) 
        {
            return
        }
        const id = msg['#']
        const replyToId = msg['@']

        if (msg.put) 
        {
            this.emit('graphData', {
                data: msg.put,
                id,
                replyToId
            })
        }

        if (replyToId) 
        {
            const cb = this._callbacks[replyToId]
            if (cb) 
            {
                cb(msg)
            }
        }

        this.emit('receiveMessage', msg)
    }
}

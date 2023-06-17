import { isDefined, isFunction, isString, isNumber, isObject } from 'topgun-typed';
import {
    SystemEvent,
    TGChainOptions, TGGraphData,
    TGMessageCb,
    TGOnCb,
    TGOptionsGet,
    TGOptionsPut,
    TGUserReference,
    TGValue,
} from '../types';
import { TGClient } from './client';
import { TGEvent } from './control-flow/event';
import { TGGraph } from './graph/graph';
import { pubFromSoul } from '../sea';
import { assertFn, assertNotEmptyString } from '../utils/assert';
import { getNodeSoul } from '../utils/node';
import { generateMessageId } from './graph/graph-utils';

/* eslint-disable @typescript-eslint/no-empty-function */
export class TGLink
{
    key: string;
    soul: string|undefined;
    optionsGet: TGOptionsGet|undefined;

    protected readonly _updateEvent: TGEvent<TGValue|undefined, string>;
    protected readonly _chain: TGClient;
    protected readonly _parent?: TGLink;
    protected _opt: TGChainOptions;
    protected _hasReceived: boolean;
    protected _lastValue: TGValue|undefined;
    protected _endQuery?: () => void;
    protected _multiple?: boolean;

    /**
     * Constructor
     */
    constructor(chain: TGClient, key: string, parent?: TGLink)
    {
        this.key          = key;
        this._opt         = {};
        this._chain       = chain;
        this._parent      = parent;
        this._hasReceived = false;
        this._updateEvent = new TGEvent(this.getPath().join('|'));
        if (!parent)
        {
            this.soul = key;

            if (key.startsWith('~') && pubFromSoul(key))
            {
                this._chain.pub = pubFromSoul(key);
            }
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    userPubExpected(): boolean
    {
        return this.getPath().some(path => path.includes(this._chain.WAIT_FOR_USER_PUB));
    }

    /**
     * Graph from the current chain link
     */
    getGraph(): TGGraph
    {
        return this._chain.graph;
    }

    /**
     * @returns path of this node
     */
    getPath(): string[]
    {
        if (this._parent)
        {
            return [...this._parent.getPath(), this.key];
        }

        return [this.key];
    }

    /**
     * Traverse a location in the graph
     *
     * @param key Key to read data from
     * @returns New chain context corresponding to given key
     */
    get(key: string): TGLink
    {
        return new (this.constructor as any)(this._chain, assertNotEmptyString(key), this);
    }

    /**
     * Move up to the parent context on the chain.
     *
     * Every time a new chain is created, a reference to the old context is kept to go back to.
     *
     * @param amount The number of times you want to go back up the chain. {-1} or {Infinity} will take you to the root.
     * @returns a parent chain context
     */
    back(amount = 1): TGLink|TGClient
    {
        if (amount < 0 || amount === Infinity)
        {
            return this._chain;
        }
        if (amount === 1)
        {
            return this._parent || this._chain;
        }
        return this.back(amount - 1);
    }

    /**
     * Save data into topGun, syncing it with your connected peers.
     *
     * You do not need to re-save the entire object every time, topGun will automatically
     * merge your data into what already exists as a "partial" update.
     *
     * @param value the data to save
     * @param cb an optional callback, invoked on each acknowledgment
     * @param opt options put
     * @returns same chain context
     **/
    put(value: TGValue, cb?: TGMessageCb, opt?: TGOptionsPut): TGLink
    {
        if (this.userPubExpected())
        {
            throw new Error(
                'You cannot save data to user space if the user is not authorized.',
            );
        }
        if (!this._parent && !isObject(value))
        {
            throw new Error(
                'Data at root of graph must be a node (an object).',
            );
        }
        this._chain.graph.putPath(
            this.getPath(),
            value,
            cb,
            opt,
        );

        return this;
    }

    not(cb: (key: string) => void): TGLink
    {
        this.promise().then(val => !isDefined(val) && cb(this.key));
        return this;
    }

    opt(options?: TGChainOptions): TGChainOptions
    {
        if (isObject(options))
        {
            this._opt = { ...this._opt, ...options };
        }
        if (this._parent)
        {
            return { ...this._parent.opt(), ...this._opt };
        }
        return this._opt;
    }

    once(cb: TGOnCb, timeout = 500): TGLink
    {
        cb = assertFn<TGOnCb>(cb);
        this.promise({ timeout, cb });
        return this;
    }

    on(cb: TGOnCb): TGLink
    {
        cb = assertFn<TGOnCb>(cb);
        return this._multiple ? this._onMap(cb) : this._on(cb);
    }

    off(cb?: TGOnCb): TGLink
    {
        if (cb)
        {
            this._updateEvent.off(cb);
            if (this._endQuery && this._updateEvent.listenerCount() === 0)
            {
                this._endQuery();
            }
        }
        else
        {
            if (this._endQuery)
            {
                this._endQuery();
            }
            this._updateEvent.reset();
        }

        return this;
    }

    promise(opts?: {timeout: number, cb?: TGOnCb}): Promise<TGValue|undefined>
    {
        return new Promise<TGValue>((ok: (...args: any) => void) =>
        {
            const connectorMsgId    = generateMessageId();
            const connectorCallback = (data?: TGGraphData, msgId?: string) => connectorMsgId === msgId && resolve();
            const resolve           = (val?: TGValue) =>
            {
                ok(val);
                this.off(callback);
                this._chain.graph.events.graphData.off(connectorCallback);
            };
            const originalCallback  = isFunction(opts && opts.cb) ? opts.cb : () =>
            {
            };
            const callback          = (val: TGValue|undefined, soul?: string) =>
            {
                originalCallback(val, soul);

                // Terminate if only one node is requested
                if (!this._multiple)
                {
                    resolve(val);
                }
            };

            if (this._multiple)
            {
                this._onMap(callback, connectorMsgId);
                // Wait until at least one of the connectors returns a graph data
                this._chain.graph.events.graphData.on(connectorCallback);
            }
            else
            {
                this._on(callback);
            }

            // Resolve by timeout
            if (isNumber(opts?.timeout))
            {
                setTimeout(() => resolve(), opts.timeout);
            }
        });
    }

    map(): TGLink
    {
        this._multiple = true;
        return this;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    private _setUserPub(pub: string): void
    {
        if (this._parent)
        {
            this._parent._setUserPub(pub);
        }
        else
        {
            this._chain.pub = pub;
            this.key        = this.key.replace(this._chain.WAIT_FOR_USER_PUB, pub);

            if (isObject(this.optionsGet) && isString(this.optionsGet['#']))
            {
                this.optionsGet['#'] = this.optionsGet['#'].replace(this._chain.WAIT_FOR_USER_PUB, pub);
            }
        }
    }

    private _onQueryResponse(value?: TGValue): void
    {
        const soul = getNodeSoul(value) || this.key;
        this._updateEvent.trigger(value, soul);
        this._lastValue   = value;
        this._hasReceived = true;
    }

    private _on(cb: TGOnCb): TGLink
    {
        return this._maybeWaitAuth(() =>
        {
            this._updateEvent.on(cb);
            if (this._hasReceived)
            {
                cb(this._lastValue, this.key);
            }
            if (!this._endQuery)
            {
                this._endQuery = this._chain.graph.query(
                    this.getPath(),
                    this._onQueryResponse.bind(this),
                );
            }
        });
    }

    private _onMap(cb: TGOnCb, msgId?: string): TGLink
    {
        return this._maybeWaitAuth(() =>
        {
            this._updateEvent.on(cb);
            if (!this._endQuery)
            {
                this._endQuery = this._chain.graph.queryMany(
                    this.optionsGet,
                    this._onQueryResponse.bind(this),
                    msgId
                );
            }
        });
    }

    private _maybeWaitAuth(handler: () => void): TGLink
    {
        if (this.userPubExpected())
        {
            this._chain.promise<TGUserReference>(SystemEvent.auth).then((value) =>
            {
                this._setUserPub(value.pub);
                handler();
            });
        }
        else
        {
            handler();
        }

        return this;
    }
}

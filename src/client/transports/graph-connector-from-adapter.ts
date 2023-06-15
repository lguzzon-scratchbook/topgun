import { TGGet, TGPut, TGGraphAdapter } from '../../types';
import { generateMessageId } from '../graph/graph-utils';
import { TGGraphWireConnector } from './graph-wire-connector';

const NOOP = () => undefined;

export class TGGraphConnectorFromAdapter extends TGGraphWireConnector
{
    protected readonly adapter: TGGraphAdapter;

    /**
     * Constructor
     */
    constructor(adapter: TGGraphAdapter, name = 'GraphConnectorFromAdapter')
    {
        super(name);
        this.adapter = adapter;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    get({ soul, cb, options, msgId = '' }: TGGet): () => void
    {
        this.adapter
            .get(soul, options)
            .then(graphData => ({
                '#'  : generateMessageId(),
                '@'  : msgId,
                'put': graphData
            }))
            .catch((error) =>
            {
                console.warn(error.stack || error);

                return {
                    '#'  : generateMessageId(),
                    '@'  : msgId,
                    'err': 'Error fetching node',
                };
            })
            .then((msg) =>
            {
                this.ingest([msg]);
                if (cb)
                {
                    cb(msg);
                }
            });

        return NOOP;
    }

    put({ graph, msgId = '', cb }: TGPut): () => void
    {
        this.adapter
            .put(graph)
            .then(() =>
            {
                return {
                    '#'  : generateMessageId(),
                    '@'  : msgId,
                    'err': null,
                    'ok' : true,
                };
            })
            .catch((error) =>
            {
                console.warn(error.stack || error);

                return {
                    '#'  : generateMessageId(),
                    '@'  : msgId,
                    'err': 'Error saving put',
                    'ok' : false,
                };
            })
            .then((msg) =>
            {
                this.ingest([msg]);
                if (cb)
                {
                    cb(msg);
                }
            });

        return NOOP;
    }
}

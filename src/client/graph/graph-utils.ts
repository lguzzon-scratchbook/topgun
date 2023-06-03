import { isDefined, isObject, cloneValue } from 'topgun-typed';
import { addMissingState, diffCRDT, mergeGraph } from '../../crdt';
import { TGGraphData, TGNode, TGPathData } from '../../types';
import { TGLink } from '../link';

export function generateMessageId(): string
{
    return Math.random().toString(36).slice(2);
}

export function diffSets(
    initial: readonly string[],
    updated: readonly string[],
): readonly [readonly string[], readonly string[]]
{
    return [
        updated.filter(key => initial.indexOf(key) === -1),
        initial.filter(key => updated.indexOf(key) === -1),
    ];
}

export function nodeToGraph(node: TGNode): TGGraphData
{
    const modified         = cloneValue(node);
    let nodes: TGGraphData = {};
    const nodeSoul         = node && node._ && node._['#'];

    for (const key in node)
    {
        if (key === '_')
        {
            continue;
        }
        const val = node[key];
        if (typeof val !== 'object' || val === null)
        {
            continue;
        }

        if (val.soul)
        {
            const edge    = { '#': val.soul };
            modified[key] = edge;

            continue;
        }

        let soul = val && val._ && val._['#'];

        if (val instanceof TGLink && val.optionsGet['#'])
        {
            soul = val.optionsGet['#'];
        }

        if (soul)
        {
            const edge    = { '#': soul };
            modified[key] = edge;
            const graph   = addMissingState(nodeToGraph(val));
            const diff    = diffCRDT(graph, nodes);
            nodes         = diff ? mergeGraph(nodes, diff) : nodes;
        }
    }

    const raw              = { [nodeSoul as string]: modified };
    const withMissingState = addMissingState(raw);
    const graphDiff        = diffCRDT(withMissingState, nodes);
    nodes                  = graphDiff ? mergeGraph(nodes, graphDiff) : nodes;

    return nodes;
}

export function flattenGraphData(data: TGGraphData): TGGraphData
{
    const graphs: TGGraphData[] = [];
    let flatGraph: TGGraphData  = {};

    for (const soul in data)
    {
        if (!soul)
        {
            continue;
        }

        const node = data[soul];
        if (node)
        {
            graphs.push(nodeToGraph(node));
        }
    }

    for (const graph of graphs)
    {
        const diff = diffCRDT(graph, flatGraph);
        flatGraph  = diff ? mergeGraph(flatGraph, diff) : flatGraph;
    }

    return flatGraph;
}

export function getPathData(
    keys: string[],
    graph: TGGraphData,
): TGPathData
{
    const lastKey = keys[keys.length - 1];

    if (keys.length === 1)
    {
        return {
            complete: lastKey in graph,
            souls   : keys,
            value   : graph[lastKey],
        };
    }

    const {
        value: parentValue,
        souls,
        complete,
    } = getPathData(keys.slice(0, keys.length - 1), graph);

    if (!isObject(parentValue))
    {
        return {
            complete: complete || isDefined(parentValue),
            souls,
            value   : undefined,
        };
    }

    const value = (parentValue as TGNode)[lastKey];

    if (!value)
    {
        return {
            complete: true,
            souls,
            value,
        };
    }

    const edgeSoul = value['#'];

    if (edgeSoul)
    {
        return {
            complete: edgeSoul in graph,
            souls   : [...souls, edgeSoul],
            value   : graph[edgeSoul],
        };
    }

    return {
        complete: true,
        souls,
        value,
    };
}

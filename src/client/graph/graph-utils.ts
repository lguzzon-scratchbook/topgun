import { isDefined, isNumber, isObject, isString } from '@topgunbuild/typed'
import { filterNodes } from '../../storage/utils'
import type {
    TGGraphData,
    TGNode,
    TGOptionsGet,
    TGPathData,
    TGValue
} from '../../types'
import { isSupportValue } from '../../utils/is-support'

export function diffSets(
    initial: readonly string[],
    updated: readonly string[]
): readonly [readonly string[], readonly string[]] 
{
    return [
        updated.filter(key => initial.indexOf(key) === -1),
        initial.filter(key => updated.indexOf(key) === -1)
    ]
}

export function getNodesFromGraph(
    options: TGOptionsGet,
    graph: TGGraphData
): TGNode[] 
{
    const allNodes = Object.values(graph)
    let filteredNodes = filterNodes(allNodes, options)

    if (isNumber(options['%']) && filteredNodes.length > options['%']) 
    {
        filteredNodes = filteredNodes.slice(0, options['%'])
    }

    return filteredNodes
}

function graphData(
    souls: string[],
    value: TGValue,
    complete: boolean,
    graph: TGGraphData
): TGPathData 
{
    const refSoul = value && value['#']

    if (isString(refSoul)) 
    {
        return {
            complete: refSoul in graph,
            souls   : [...souls, refSoul],
            value   : graph[refSoul]
        }
    }

    return {
        value,
        souls,
        complete
    }
}

function getSoulsFromKeys(keys: string[]): string[] 
{
    const souls = keys.reduce((accum, key) => 
    {
        const lastPath = accum[accum.length - 1]

        if (lastPath) 
        {
            return [...accum, [lastPath, key].join('/')]
        }

        return [key]
    }, [])

    return souls.length > 2 ? souls.slice(-2) : souls
}

export function getPathData(keys: string[], graph: TGGraphData): TGPathData 
{
    const souls = getSoulsFromKeys(keys)
    const lastSoul = souls[souls.length - 1]
    const lastKey = keys[keys.length - 1]
    let complete = lastSoul in graph
    let value: TGNode | TGValue = graph[lastSoul]

    if (souls.length === 1 || complete) 
    {
        return graphData([lastSoul], value, complete, graph)
    }

    const preLastSoul = souls[souls.length - 2]
    complete = preLastSoul in graph
    value = isObject(graph[preLastSoul]) ? graph[preLastSoul][lastKey] : undefined

    if (complete && isDefined(value)) 
    {
        return graphData([preLastSoul], value, complete, graph)
    }

    return {
        souls,
        complete: false,
        value   : undefined
    }
}

export function flattenGraphData(
    data: TGValue,
    fullPath: string[]
): {
        graphData: TGGraphData
        soul: string
    } 
{
    if (isObject(data)) 
    {
        const soul = fullPath.join('/')
        return {
            graphData: flattenGraphByPath(data, [soul]),
            soul
        }
    }
    else if (fullPath.length === 1 && data === null) 
    {
        const soul = fullPath[0]

        return {
            graphData: { [soul]: null },
            soul
        }
    }
    else 
    {
        const propertyName = fullPath.pop()
        const soul = fullPath.join('/').trim()

        return {
            graphData: flattenGraphByPath({ [propertyName]: data }, [soul]),
            soul
        }
    }
}

export function checkType(d: any, tmp?: any): string 
{
    return (d && (tmp = d.constructor) && tmp.name) || typeof d
}

export function set(list: Array<string>, value: any): { [key: string]: any } 
{
    return list.reverse().reduce((a, c) => ({ [c]: a }), value)
}

export function flattenGraphByPath(
    obj: object,
    pathArr: string[] = [],
    target = {}
): TGGraphData 
{
    if (!isSupportValue(obj)) 
    {
        throw Error('Invalid data: ' + checkType(obj) + ' at ' + pathArr.join('.'))
    }
    else if (!isObject(obj)) 
    {
        obj = set(pathArr, obj)
    }

    const path = pathArr.join('/')
    if (pathArr.length > 0 && !isObject(target[path])) 
    {
        target[path] = {}
    }

    for (const k in obj) 
    {
        if (!obj.hasOwnProperty(k) || k === '_') 
        {
            continue
        }

        const value = obj[k]
        const pathArrFull = [...pathArr, k]
        const pathFull = pathArrFull.join('/')

        if (!isSupportValue(value)) 
        {
            console.trace(
                'Invalid data: ' + checkType(value) + ' at ' + pathArrFull.join('.')
            )
            continue
        }

        if (isObject(value)) 
        {
            target[path][k] = { '#': pathFull }
            flattenGraphByPath(value, pathArrFull, target)
        }
        else 
        {
            target[path][k] = value
        }
    }
    return target
}

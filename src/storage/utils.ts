import {
    isBoolean,
    isDefined,
    isEmptyObject,
    isNotEmptyObject,
    isNumber,
    isObject,
    isString
} from '@topgunbuild/typed'
import { TextEncoder } from '../sea/shims'
import type {
    TGGraphAdapterOptions,
    TGGraphData,
    TGNode,
    TGOptionsGet
} from '../types'
import { getNodeSoul } from '../utils/node'
import { MAX_KEY_SIZE, MAX_VALUE_SIZE } from './constants'

export function arrayNodesToObject(nodes: TGNode[]): TGGraphData 
{
    return nodes.reduce((accum: TGGraphData, node: TGNode) => 
    {
        accum[getNodeSoul(node)] = node
        return accum
    }, {})
}

export function filterNodes(nodes: TGNode[], options: TGOptionsGet): TGNode[] 
{
    if (isEmptyObject(options)) 
    {
        return nodes
    }

    const direction = options['-'] ? -1 : 1
    const filteredNodes = nodes
        .filter(node => filterMatch(getNodeSoul(node), options))
        .sort(
            (a, b) => direction * lexicographicCompare(getNodeSoul(a), getNodeSoul(b))
        )

    if (isNumber(options['%']) && filteredNodes.length > options['%']) 
    {
        return filteredNodes.slice(0, options['%'])
    }

    return filteredNodes
}

export function getListOptions(options: TGOptionsGet): TGOptionsGet | null 
{
    if (isEmptyObject(options)) 
    {
        return null
    }

    const listOptions: TGOptionsGet = {}
    const getPath = (path: string) =>
        isString(options['#']) ? [options['#'], path].join('/') : path

    if (isBoolean(options['-'])) 
    {
        listOptions['-'] = options['-']
    }
    if (isNumber(options['%'])) 
    {
        listOptions['%'] = options['%']
    }

    if (isString(options['*'])) 
    {
        listOptions['*'] = getPath(options['*'])
    }
    else if (isString(options['#']) && isNotEmptyObject(listOptions)) 
    {
        listOptions['*'] = `${options['#']}/`
    }

    if (isString(options['<'])) 
    {
        listOptions['<'] = getPath(options['<'])
    }
    if (isString(options['>'])) 
    {
        listOptions['>'] = getPath(options['>'])
    }

    return isEmptyObject(listOptions) ? null : listOptions
}

export function filterMatch(
    name: string,
    options: TGOptionsGet | undefined
): boolean 
{
    if (!isString(name)) 
    {
        return false
    }

    if (isEmptyObject(options) || !isObject(options)) 
    {
        return true
    }

    if (name === options['#']) 
    {
        return true
    }

    const listOptions = getListOptions(options)
    if (!listOptions) 
    {
        return false
    }

    return !(
        (isDefined(listOptions['*']) && !name.startsWith(listOptions['*'])) ||
    (isDefined(listOptions['>']) &&
      lexicographicCompare(name, listOptions['>']) < 0) ||
    (isDefined(listOptions['<']) &&
      lexicographicCompare(name, listOptions['<']) >= 0)
    )
}

export function assertPutEntry(
    soul: string,
    node: TGNode,
    options: TGGraphAdapterOptions
): void 
{
    const maxKeySize = isNumber(options?.maxKeySize)
        ? options.maxKeySize
        : MAX_KEY_SIZE
    const maxValueSize = isNumber(options?.maxValueSize)
        ? options.maxValueSize
        : MAX_VALUE_SIZE
    assertKeySize(soul, maxKeySize)
    assertValueSize(node, maxValueSize, soul)
}

export function assertKeySize(key: string, maxKeySize: number): void 
{
    if (TextEncoder.encode(key).length > maxKeySize) 
    {
        throw new RangeError(
            `Key "${key}" is larger than the limit of ${maxKeySize} bytes.`
        )
    }
}

export function assertValueSize(
    value: TGNode,
    maxValueSize: number,
    key?: string
): void 
{
    if (roughSizeOfObject(value) > maxValueSize) 
    {
        if (key !== undefined) 
        {
            throw new RangeError(
                `Value for key "${key}" is above the limit of ${maxValueSize} bytes.`
            )
        }
        throw new RangeError(`Values cannot be larger than ${maxValueSize} bytes.`)
    }
}

function roughSizeOfObject(object: object): number 
{
    const objectList = new Set()
    const stack = [object]
    let bytes = 0

    while (stack.length) 
    {
        const value: any = stack.pop()

        if (typeof value === 'boolean') 
        {
            bytes += 4
        }
        else if (typeof value === 'string') 
        {
            bytes += value.length * 2
        }
        else if (typeof value === 'number') 
        {
            bytes += 8
        }
        else if (typeof value === 'object' && !objectList.has(value)) 
        {
            objectList.add(value)

            for (const key in value) 
            {
                if (Object.prototype.hasOwnProperty.call(value, key)) 
                {
                    stack.push(value[key])
                }
            }
        }
    }
    return bytes
}

export function arrayCompare<T extends Array<any> | NodeJS.TypedArray>(
    a: T,
    b: T
): number 
{
    const minLength = Math.min(a.length, b.length)
    for (let i = 0; i < minLength; i++) 
    {
        if (a[i] < b[i]) return -1
        if (a[i] > b[i]) return 1
    }
    return a.length - b.length
}

export function lexicographicCompare(x: string, y: string): number 
{
    const xEncoded = TextEncoder.encode(x)
    const yEncoded = TextEncoder.encode(y)
    return arrayCompare(xEncoded, yEncoded)
}

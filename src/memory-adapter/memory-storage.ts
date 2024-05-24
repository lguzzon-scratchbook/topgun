import { isNumber } from '@topgunbuild/typed'
import type { TGStorage } from '../storage'
import { filterMatch, lexicographicCompare } from '../storage/utils'
import type { TGGraphData, TGNode, TGOptionsGet } from '../types'

export class MemoryStorage implements TGStorage 
{
    constructor(protected map = new Map<string, TGNode>()) 
    {}

    async list(options: TGOptionsGet): Promise<TGGraphData> 
    {
        const direction = options && options['-'] ? -1 : 1
        let keys = []

        // Filter and sort keys in a single pass
        for (const key of this.map.keys()) 
        {
            if (filterMatch(key, options)) 
            {
                keys.push(key)
            }
        }

        keys.sort((a, b) => direction * lexicographicCompare(a, b))

        // Limit the number of keys if a limit is specified
        if (isNumber(options && options['%']) && keys.length > options['%']) 
        {
            keys = keys.slice(0, options['%'])
        }

        const result: TGGraphData = {}
        for (const key of keys) 
        {
            result[key] = this.map.get(key)
        }

        return result
    }

    async put(key: string, value: TGNode): Promise<void> 
    {
        this.map.set(key, value)
    }

    async get(key: string): Promise<TGNode | null> 
    {
        return this.map.get(key) || null
    }

    putSync(key: string, value: TGNode): void 
    {
        this.map.set(key, value)
    }

    getSync(key: string): TGNode | null 
    {
        return this.map.get(key) || null
    }
}

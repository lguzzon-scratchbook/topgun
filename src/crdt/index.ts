import { cloneValue } from '@topgunbuild/typed'
import type {
    CRDTOptions,
    TGGraphData,
    TGNode,
    TGNodeMeta,
    TGNodeState
} from '../types'

const EMPTY: any = {}

export function addMissingState(graphData: Partial<TGGraphData>): TGGraphData 
{
    const updatedGraphData = cloneValue(graphData)
    const now = Date.now()

    for (const soul in graphData) 
    {
        if (!soul) continue

        const node = graphData[soul]
        if (!node) continue

        const meta = (node._ = node._ || { '#': soul, '>': {} })
        const state = meta['>']

        for (const key in node) 
        {
            if (key === '_') continue
            if (!(key in state)) 
            {
                state[key] = now
            }
        }

        updatedGraphData[soul] = node
    }

    return updatedGraphData as TGGraphData
}

const DEFAULT_OPTS = {
    Lexical    : JSON.stringify,
    futureGrace: 10 * 60 * 1000
}

export function diffCRDT(
    updatedGraph: TGGraphData,
    existingGraph: TGGraphData,
    opts: CRDTOptions = DEFAULT_OPTS
): TGGraphData | undefined 
{
    const {
        machineState = Date.now(),
        futureGrace = DEFAULT_OPTS.futureGrace,
        Lexical = DEFAULT_OPTS.Lexical
    } = opts
    const maxState = machineState + futureGrace

    const allUpdates: TGGraphData = {}

    for (const soul in updatedGraph) 
    {
        if (!soul) continue

        const existing = existingGraph[soul]
        const updated = updatedGraph[soul]
        const existingState: TGNodeState = existing?._?.['>'] || EMPTY
        const updatedState: TGNodeState = updated?._?.['>'] || EMPTY

        if (!updated) 
        {
            allUpdates[soul] = updated
            continue
        }

        let hasUpdates = false
        const updates: TGNode = { _: { '#': soul, '>': {} } }

        for (const key in updatedState) 
        {
            if (!key) continue

            const existingKeyState = existingState[key]
            const updatedKeyState = updatedState[key]

            if (updatedKeyState > maxState || !updatedKeyState) continue
            if (existingKeyState && existingKeyState >= updatedKeyState) continue

            if (existingKeyState === updatedKeyState) 
            {
                const existingVal = existing?.[key]
                const updatedVal = updated[key]
                if (Lexical(updatedVal) <= Lexical(existingVal)) continue
            }

            updates[key] = updated[key]
            updates._['>'][key] = updatedKeyState
            hasUpdates = true
        }

        if (hasUpdates) allUpdates[soul] = updates
    }

    return Object.keys(allUpdates).length > 0 ? allUpdates : undefined
}

export function mergeNodes(
    existing: TGNode | undefined,
    updates: TGNode | undefined,
    mut: 'immutable' | 'mutable' = 'immutable'
): TGNode | undefined 
{
    if (!existing) return updates
    if (updates === null) return null
    if (!updates) return existing

    const existingMeta = existing._ || {}
    const existingState = existingMeta['>'] || {}
    const updatedMeta = updates._ || {}
    const updatedState = updatedMeta['>'] || {}

    if (mut === 'mutable') 
    {
        Object.assign(existing, updates)
        Object.assign(existingState, updatedState)
        existingMeta['>'] = existingState
        existing._ = existingMeta as TGNodeMeta
        return existing
    }

    return {
        ...existing,
        ...updates,
        _: {
            '#': existingMeta['#'],
            '>': {
                ...existingMeta['>'],
                ...updatedState
            }
        }
    }
}

export function mergeGraph(
    existing: TGGraphData,
    diff: TGGraphData,
    mut: 'immutable' | 'mutable' = 'immutable'
): TGGraphData 
{
    const result: TGGraphData = mut === 'mutable' ? existing : { ...existing }

    for (const soul in diff) 
    {
        if (!soul) continue
        result[soul] = mergeNodes(existing[soul], diff[soul], mut)
    }

    return result
}

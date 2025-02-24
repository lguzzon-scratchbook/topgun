import type { TGStorage } from '../storage'
import { arrayNodesToObject, filterNodes } from '../storage/utils'
import type { TGGraphData, TGNode, TGOptionsGet } from '../types'

import memize from 'memize'

const filenameAllowedChars = new Set(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-'
)

const hexCharValue = (char: string): string => 
{
    return char.codePointAt(0)!.toString(16)
}
const hexCharValueM = memize(hexCharValue, { maxSize: 1000 }) as (
    char: string
) => string

const key2Filename = (key: string) => 
{
    const chars2Change = new Set<string>()
    for (const char of key) 
    {
        if (!filenameAllowedChars.has(char)) 
        {
            chars2Change.add(char)
        }
    }
    for (const char of chars2Change) 
    {
        key = key.replaceAll(char, hexCharValueM(char))
    }
    return key
}

const key2FilenameM = memize(key2Filename, { maxSize: 1000 })

export class OPFSStorage implements TGStorage 
{
    private _root: FileSystemDirectoryHandle
    readonly _dirName: string

    constructor(dirName: string) 
    {
        this._dirName = dirName
        this.#init()
    }

    async #init() 
    {
        this._root = await (
            await navigator.storage.getDirectory()
        ).getDirectoryHandle(this._dirName, { create: true })
    }

    async get(key: string): Promise<TGNode | undefined> 
    {
        try 
        {
            const fileHandle = await this.#getFileHandle(key)
            const file = await fileHandle.getFile()
            const text = await file.text()
            return JSON.parse(text)
        }
        catch (error) 
        {
            return undefined
        }
    }

    async list(options: TGOptionsGet): Promise<TGGraphData> 
    {
        const allNodes = await this.getAll()
        const nodes = filterNodes(allNodes, options)
        return arrayNodesToObject(nodes)
    }

    async put(key: string, value: any): Promise<void> 
    {
        const fileHandle = await this.#getFileHandle(key, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(JSON.stringify(value))
        await writable.close()
    }

    async getAll(): Promise<TGNode[]> 
    {
        const nodes: TGNode[] = []
        for await (const [key, handle] of this._root as any) 
        {
            if (handle.kind === 'file') 
            {
                const file = await handle.getFile()
                const text = await file.text()
                nodes.push(JSON.parse(text))
            }
        }
        return nodes
    }
    async #getFileHandle(
        key: string,
        options?: { create?: boolean }
    ): Promise<FileSystemFileHandle> 
    {
        const keyFilename = key2FilenameM(key)
        try 
        {
            return await this._root.getFileHandle(keyFilename, options)
        }
        catch (error) 
        {
            if (error instanceof TypeError && !this._root) 
            {
                await this.#init()
                return await this._root.getFileHandle(keyFilename, options)
            }
            throw error
        }
    }
}

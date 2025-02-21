import type { TGStorage } from '../storage'
import { arrayNodesToObject, filterNodes } from '../storage/utils'
import type { TGGraphData, TGNode, TGOptionsGet } from '../types'

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
        try 
        {
            return await this._root.getFileHandle(
                key.replace(/[^a-zA-Z0-9_.-]/g, '_'),
                options
            )
        }
        catch (error) 
        {
            if (error instanceof TypeError && !this._root) 
            {
                await this.#init()
                return await this._root.getFileHandle(
                    key.replace(/[^a-zA-Z0-9_.-]/g, '_'),
                    options
                )
            }
            throw error
        }
    }
}

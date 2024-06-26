import type { TGMessage } from '../../types'
import { TGMiddlewareSystem } from './middleware-system'
import { TGQueue } from './queue'

type TGProcessDupesOption = 'process_dupes' | 'dont_process_dupes'

export class TGProcessQueue<
    T = TGMessage,
    U = any,
    V = any
> extends TGQueue<T> 
{
    isProcessing: boolean
    readonly middleware: TGMiddlewareSystem<T, U, V>
    readonly processDupes: TGProcessDupesOption

    protected alreadyProcessed: T[]

    /**
   * Constructor
   */
    constructor(
        name = 'ProcessQueue',
        processDupes: TGProcessDupesOption = 'process_dupes'
    ) 
    {
        super(name)
        this.alreadyProcessed = []
        this.isProcessing = false
        this.processDupes = processDupes
        this.middleware = new TGMiddlewareSystem<T, U, V>(`${name}.middleware`)
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    has(item: T): boolean 
    {
        return super.has(item) || this.alreadyProcessed.indexOf(item) !== -1
    }

    async processNext(b?: U, c?: V): Promise<void> 
    {
        let item = this.dequeue()
        const processedItem = item

        if (!item) 
        {
            return
        }

        item = (await this.middleware.process(item, b, c)) as T | undefined

        if (processedItem && this.processDupes === 'dont_process_dupes') 
        {
            this.alreadyProcessed.push(processedItem)
        }

        if (item) 
        {
            this.emit('completed', item)
        }
    }

    enqueueMany(items: readonly T[]): TGProcessQueue<T, U, V> 
    {
        super.enqueueMany(items)
        return this
    }

    async process(): Promise<void> 
    {
        if (this.isProcessing) 
        {
            return
        }

        if (!this.count()) 
        {
            return
        }

        this.isProcessing = true
        while (this.count()) 
        {
            try 
            {
                await this.processNext()
            }
            catch (e) 
            {
                console.error('Process Queue error', e)
            }
        }

        this.emit('emptied', true)
        this.isProcessing = false
    }
}

import { consoleTransport } from './transports/console-transport'
import type { TGLoggerOptions } from './types'
import { asyncFunc, stringifyFunc } from './utils'

/** Default configuration parameters for logger */
export const defaultLoggerOptions: TGLoggerOptions = {
    transport       : consoleTransport,
    transportOptions: {
        colors: {
            debug: null,
            log  : 'greenBright',
            warn : 'yellowBright',
            error: 'redBright'
        }
    },
    levels           : ['debug', 'log', 'warn', 'error'],
    async            : false,
    asyncFunc        : asyncFunc,
    stringifyFunc    : stringifyFunc,
    printLevel       : true,
    printDate        : true,
    dateFormat       : 'time',
    enabled          : false,
    enabledExtensions: null
}

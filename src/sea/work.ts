import { isObject, isString } from '@topgunbuild/typed'
import type { Pair } from './pair'
import { pseudoRandomText } from './pseudo-random-text'
import { pbkdf2 } from './settings'
import { crypto, Buffer, TextEncoder } from './shims'

const DEFAULT_OPTS: WorkOptions = {
    encode: 'base64',
    hash  : pbkdf2.hash.name,
    name  : 'PBKDF2'
}

export interface WorkOptions {
    name?: 'SHA-256' | 'PBKDF2'
    encode?: 'base64' | 'utf8' | 'hex'
    salt?: any
    hash?: string
    length?: number
    iterations?: number
}

export async function work(
    data: string,
    saltOrPair: string | Pair | null,
    opt: WorkOptions = DEFAULT_OPTS
): Promise<string> 
{
    // epub not recommended, salt should be random!
    const salt =
    isObject(saltOrPair) && isString(saltOrPair.epub)
        ? saltOrPair.epub
        : isString(saltOrPair)
            ? saltOrPair
            : pseudoRandomText()

    const key = await crypto.subtle.importKey(
        'raw',
        TextEncoder.encode(data),
        { name: opt.name || DEFAULT_OPTS.name || '' },
        false,
        ['deriveBits']
    )
    const res = await crypto.subtle.deriveBits(
        {
            hash      : opt.hash || DEFAULT_OPTS.hash,
            iterations: opt.iterations || pbkdf2.iter,
            name      : opt.name || 'PBKDF2',
            salt      : TextEncoder.encode(salt)
        },
        key,
        opt.length || pbkdf2.ks * 8
    )
    return Buffer.from(res).toString(opt.encode || DEFAULT_OPTS.encode)
}

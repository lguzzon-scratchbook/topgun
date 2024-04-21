import { isString } from '@topgunbuild/typed'
import { crypto, Buffer, TextEncoder } from './shims'

export async function sha256(
    input: string | object,
    name = 'SHA-256'
): Promise<any> 
{
    const inp = isString(input) ? input : JSON.stringify(input)
    const encoded = TextEncoder.encode(inp)
    const hash = await crypto.subtle.digest({ name }, encoded)
    return Buffer.from(hash)
}

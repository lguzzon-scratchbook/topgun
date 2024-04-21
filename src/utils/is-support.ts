import { isBoolean, isNumber, isObject, isString } from '@topgunbuild/typed'
import type { TGValue } from '../types'

export function isSupportValue(value: unknown): value is TGValue 
{
    return (
        isObject(value) ||
    isString(value) ||
    isBoolean(value) ||
    // we want +/- Infinity to be, but JSON does not support it, sad face.
    (isNumber(value) &&
      value !== Number.POSITIVE_INFINITY &&
      value !== Number.NEGATIVE_INFINITY &&
      !Number.isNaN(value)) ||
    value === null
    )
}

import { isBoolean, isObject, isString } from '@topgunbuild/typed'

export const isMessage = (value: unknown) => 
{
    return (
        isObject(value) &&
    isString(value['#']) &&
    isBoolean(value.ok) &&
    value.hasOwnProperty('err') &&
    value.hasOwnProperty('ok')
    )
}

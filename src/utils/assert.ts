import {
    type Struct,
    StructError,
    boolean,
    err,
    fn,
    isObject,
    isString,
    number,
    object,
    ok,
    optional,
    string,
    unionAll,
    unwrap
} from '@topgunbuild/typed'
import type { TGUserCredentials } from '../types'

const structObject =
  (msg = 'Expected object'): Struct<any> =>
      input =>
          isObject(input) ? ok(input) : err(new StructError(msg, { input, path: [] }))

export function assertOptionsGet(
    value: unknown,
    msg = 'Expected query object'
) 
{
    const struct = object(
        {
            '*': optional(string('Expected string in \'prefix\'')),
            '>': optional(string('Expected string in \'start\'')),
            '<': optional(string('Expected string in \'end\'')),
            '-': optional(boolean('Expected boolean in \'reverse\'')),
            '%': optional(number('Expected number in \'%\''))
        },
        msg
    )
    const actual = struct(value)
    return unwrap(actual)
}

export function assertObject<T>(value: unknown, msg?: string): T 
{
    const struct = structObject(msg)
    const actual = struct(value)
    return unwrap(actual)
}

export function assertBoolean(value: unknown, msg?: string): boolean 
{
    const struct = boolean(msg)
    const actual = struct(value)
    return unwrap(actual)
}

export function assertNumber(value: unknown, msg?: string): number 
{
    const struct = number(msg)
    const actual = struct(value)
    return unwrap(actual)
}

export function assertFn<T>(value: unknown, msg?: string): T 
{
    const struct = fn(msg)
    const actual = struct(value)
    return unwrap(actual) as T
}

const structNotEmptyString =
  (msg = 'Expected non-empty string value'): Struct<string> =>
      input =>
          !isString(input)
              ? err(new StructError(msg, { input, path: [] }))
              : input.length > 0
                  ? ok(input)
                  : err(new StructError(msg, { input, path: [] }))

const structNotAllowUnderscore =
  (msg = 'Not an underscore expected'): Struct<string> =>
      input =>
          input !== '_' ? ok(input) : err(new StructError(msg, { input, path: [] }))

export function assertGetPath(value: unknown): string 
{
    const message = 'A non-empty string value and not an underscore is expected.'
    const struct = unionAll(
        [structNotEmptyString(), structNotAllowUnderscore()],
        message
    )
    const actual = struct(value)
    return unwrap(actual)
}

export function assertNotEmptyString(value: unknown, msg?: string): string 
{
    const struct = structNotEmptyString(msg)
    const actual = struct(value)
    return unwrap(actual)
}

const userCredentialsErrMes = arg =>
    `Credentials must contain '${arg}' string property.`
export const userCredentialsStruct = object(
    {
        alias: string(userCredentialsErrMes('alias')),
        pub  : string(userCredentialsErrMes('pub')),
        priv : string(userCredentialsErrMes('priv')),
        epriv: string(userCredentialsErrMes('epriv')),
        epub : string(userCredentialsErrMes('priv'))
    },
    'Credentials invalid'
)

export function assertCredentials(value: unknown): TGUserCredentials 
{
    const actual = userCredentialsStruct(value)
    return unwrap(actual)
}

export const storageStruct = object({
    getItem   : fn(),
    setItem   : fn(),
    removeItem: fn()
})

import { isNumber } from 'topgun-typed';
import { encrypt } from './encrypt';
import { pair as createPair } from './pair';
import { pseudoRandomText } from './pseudo-random-text';
import { signGraph } from './sign';
import { work } from './work';
import { TGClient } from '../client/client';
import { assertNotEmptyString } from '../utils/assert';

export async function createUser(
    client: TGClient,
    alias: string,
    password: string,
): Promise<{
        readonly alias: string;
        readonly auth: string;
        readonly epub: string;
        readonly pub: string;
        readonly epriv: string;
        readonly priv: string;
    }>
{
    const aliasSoul         = `~@${assertNotEmptyString(alias)}`;
    const passwordMinLength = isNumber(client.options.passwordMinLength)
        ? client.options.passwordMinLength
        : 8;
    const passwordMaxLength = isNumber(client.options.passwordMaxLength)
        ? client.options.passwordMaxLength
        : 48;

    if ((password || '').length < passwordMinLength)
    {
        throw Error(`Minimum password length is ${passwordMinLength}`);
    }
    if ((password || '').length > passwordMaxLength)
    {
        throw Error(`Maximum password length is ${passwordMaxLength}`);
    }

    // "pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it."
    const salt                       = pseudoRandomText(64);
    const proof                      = await work(password, salt);
    const pair                       = await createPair();
    const { pub, priv, epub, epriv } = pair;
    const pubSoul                    = `~${pub}`;

    // "to keep the private key safe, we AES encrypt it with the proof of work!"
    const ek   = await encrypt(JSON.stringify({ priv, epriv }), proof, {
        raw: true,
    });
    const auth = JSON.stringify({ ek, s: salt });
    const data = {
        alias,
        auth,
        epub,
        pub,
    };

    const now   = new Date().getTime();
    const graph = await signGraph(
        client,
        {
            [pubSoul]: {
                _: {
                    '#': pubSoul,
                    '>': Object.keys(data).reduce(
                        (state: {[key: string]: number}, key) =>
                        {
                            state[key] = now;
                            return state;
                        },
                        {},
                    ),
                },
                ...data,
            },
        },
        { pub, priv },
    );

    await new Promise(ok => client.get(aliasSoul).put(graph, ok));

    return {
        ...data,
        epriv,
        priv,
        pub,
    };
}

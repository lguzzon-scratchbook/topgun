import { TGGraphData } from '../types';

export type TGChangeSetEntry = readonly [string, TGGraphData];

export interface TGFederatedAdapterOptions
{
    readonly backSync?: number;
    readonly maxStaleness?: number;
    readonly maintainChangelog?: boolean;
    readonly putToPeers?: boolean;
    readonly batchInterval?: number;
}


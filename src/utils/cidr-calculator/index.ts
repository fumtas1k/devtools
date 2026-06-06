/** CIDR/サブネット計算機 ロジック層の公開 API */

export { parseCidr } from './parse';
export { splitSubnet } from './subnet';
export { detectOverlaps, OVERLAP_MAX_ENTRIES, OVERLAP_MAX_PAIRS } from './overlap';
export type { CidrInfo, IpVersion } from './types';
export type { OverlapRelation, OverlapPair, OverlapLineError, OverlapResult } from './overlap';

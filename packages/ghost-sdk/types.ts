export interface Spirit {
  id: string;
  regionId: string;
  originCountry: string;
  atlasId: string;
  name: string;
  nativeName: string;
  kind: string;
  culture: string;
  shortDescription: string;
  folklore: string;
  artNote?: string;
  wish: string;
  story?: { title: string; text: string }[];
  peaceLabel: string;
  prop: string;
  animation: string;
  color: string;
  atlasRow: number;
  sources: { title: string; url: string }[];
  art: {
    idle: string;
    scare: string;
    peace: string;
    thumb: string;
    share: string;
  } | null;
}
export interface Region {
  id: string;
  name: string;
  subtitle: string;
  areaIds: string[];
  nameZh: string;
}
export interface ReactionSummary {
 stats: {spiritId:string;meanHz:number|null;measured:number;views:number}[];
 links: {inviteId:string;spiritId:string;friendName:string|null;createdAt:number;visits:number;recordings:number}[];
 recent: {score:number|null;durationMs:number;friendName:string|null;hasAudio?:number;inviteId:string;receiverId:string;name:string;spiritId:string;meanHz:number|null;peakHz:number|null;createdAt:number;seenAt:number|null;level:string}[];
}
export interface Player {
  account: boolean;
  shareVisits: number;
  friendScreamScore: number | null;
  shareCount: number;
  reactions: ReactionSummary;
  id: string;
  name: string;
  country: string | null;
  selected: string | null;
  wallet: number;
  candies: number;
  peaceCount: number;
  initialized: boolean;
  progress: { spiritId: string; donated: number; peaceAt: number | null }[];
  remainingMatches: number;
  remainingInvites: number;
  hasClaimedInvite: boolean;
}
export interface Catalog {
  version: number;
  regions: Region[];
  spirits: Spirit[];
  countries: { code: string; name: string }[];
  rules: Record<string, number>;
  assetOrigin: string;
  worldMap: string;
  inviteRewards: boolean;
}
export interface Invite {
  recordingFull: boolean;
  id: string;
  name: string;
  country: string;
  spiritId: string;
  channel: string;
  eligible: boolean;
  expired: boolean;
}
export interface Challenge {
  id: string;
  spiritId: string;
  opponentId: string;
  elapsedMs: number;
  targets: number[];
  opponentScores: number[];
  roundMs: number;
  durationMs: number;
}

// Spicy Lyrics' ResolveTrack finds the playing song's catalogue entry through Spotify's page.
// Here the server has already done it (see src/resolve.ts), so this hands that back.
import { viewer } from "../state.ts";

export type ResolvedTrack = {
  readings: any[];
  twin?: any;
  [key: string]: unknown;
};

export const IsUnlistedItem = (_uri: string | undefined): boolean => false;
export const videoTwinUri = (): string | undefined => undefined;
export const videoTwin = async () => null;
export const spicyIdForVideoSong = async (): Promise<string | null | undefined> => undefined;
export const spotifyIdOf = (resolved: ResolvedTrack): string | undefined => resolved.readings?.[0]?.spotifyId;

export async function ResolveTrack(_isStale: () => boolean = () => false): Promise<ResolvedTrack> {
  const track = viewer.search?.track;
  return { readings: track ? [track] : [], twin: undefined };
}

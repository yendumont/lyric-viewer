// Spicy Lyrics' SpotifyPlayer, answered from what Windows reports (see ui/state.ts).
import { rawPositionMs, uriOf, viewer } from "../state.ts";
import GetProgress from "./GetProgress.ts";

export const COVER_PLACEHOLDER_URL = "";
export type CoverSizes = "standard" | "small" | "large" | "xlarge";
export type Artist = { type: "artist"; name: string; uri: string };

export const SpotifyPlayer = {
  get IsPlaying() {
    return viewer.clock.playing;
  },
  _DEPRECATED_: { GetTrackPosition: () => rawPositionMs() },
  GetPosition: (): number => GetProgress(),
  GetContentType: (): string => "track",
  GetMediaType: (): string => "audio",
  GetDuration: (): number => viewer.media.durationMs ?? 0,
  Seek: (position: number): void => viewer.seek(position),
  GetCover: (_size: CoverSizes): string | undefined => viewer.coverUrl || undefined,
  GetCoverFrom: (_size: CoverSizes, _source: unknown): string | undefined => viewer.coverUrl || undefined,
  GetName: (): string | undefined => viewer.search?.track?.name ?? viewer.media.title,
  GetShowName: (): string | undefined => undefined,
  GetAlbumName: (): string | undefined => viewer.search?.track?.album ?? viewer.media.album,
  GetId: (): string | undefined => viewer.search?.key,
  GetArtists: (): Artist[] | undefined =>
    (viewer.search?.track?.artists ?? [viewer.search?.track?.artist ?? viewer.media.artist ?? ""]).map((name) => ({ type: "artist" as const, name, uri: "" })),
  GetUri: (): string | undefined => uriOf(),
  Pause: () => viewer.command("pause"),
  Play: () => viewer.command("play"),
  TogglePlayState: () => viewer.command("toggle"),
  Skip: { Next: () => viewer.command("next"), Prev: () => viewer.command("prev") },
  LoopType: "none",
  ShuffleType: "none",
  IsDJ: (): boolean => false,
  IsLiked: () => false,
  ToggleLike: async () => {},
};

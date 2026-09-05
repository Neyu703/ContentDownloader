import { PlaylistCapableBasePlatform } from "./PlaylistCapableBasePlatform.js";

export class SoundCloud extends PlaylistCapableBasePlatform {
  readonly id = "soundcloud";

  static readonly HOSTS = ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"];
}

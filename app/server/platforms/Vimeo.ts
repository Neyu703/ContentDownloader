import { PlaylistCapableBasePlatform } from "./PlaylistCapableBasePlatform.js";

export class Vimeo extends PlaylistCapableBasePlatform {
  readonly id = "vimeo";

  static readonly HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];
}

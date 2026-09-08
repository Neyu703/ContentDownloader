import { BasePlatform } from "./BasePlatform.js";

export class Twitch extends BasePlatform {
  readonly id = "twitch";

  static readonly HOSTS = ["twitch.tv", "www.twitch.tv", "clips.twitch.tv", "m.twitch.tv"];
}

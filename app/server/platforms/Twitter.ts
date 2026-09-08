import { BasePlatform } from "./BasePlatform.js";

export class Twitter extends BasePlatform {
  readonly id = "twitter";

  static readonly HOSTS = ["twitter.com", "www.twitter.com", "x.com", "www.x.com"];
}

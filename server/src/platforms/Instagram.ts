import { BasePlatform } from "./BasePlatform.js";

export class Instagram extends BasePlatform {
  readonly id = "instagram";

  static readonly HOSTS = ["instagram.com", "www.instagram.com"];
}

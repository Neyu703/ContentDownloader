import { BasePlatform } from "./BasePlatform.js";

export class TikTok extends BasePlatform {
  readonly id = "tiktok";

  static readonly HOSTS = ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"];
}

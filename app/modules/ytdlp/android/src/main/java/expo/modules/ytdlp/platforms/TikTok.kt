package expo.modules.ytdlp.platforms

class TikTok(url: String) : BasePlatform(url) {
    companion object {
        val HOSTS = setOf("tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com")
    }
}

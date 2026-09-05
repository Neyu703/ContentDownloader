package expo.modules.ytdlp.platforms

class Instagram(url: String) : BasePlatform(url) {
    companion object {
        val HOSTS = setOf("instagram.com", "www.instagram.com")
    }
}

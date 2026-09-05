package expo.modules.ytdlp.platforms

class Twitter(url: String) : BasePlatform(url) {
    companion object {
        val HOSTS = setOf("twitter.com", "www.twitter.com", "x.com", "www.x.com")
    }
}

package expo.modules.ytdlp.platforms

class Twitch(url: String) : BasePlatform(url) {
    companion object {
        val HOSTS = setOf("twitch.tv", "www.twitch.tv", "clips.twitch.tv", "m.twitch.tv")
    }
}

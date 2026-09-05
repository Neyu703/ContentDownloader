package expo.modules.ytdlp.platforms

class SoundCloud(url: String) : PlaylistCapableBasePlatform(url) {
    companion object {
        val HOSTS = setOf("soundcloud.com", "www.soundcloud.com", "m.soundcloud.com")
    }
}

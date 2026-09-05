package expo.modules.ytdlp.platforms

class Vimeo(url: String) : PlaylistCapableBasePlatform(url) {
    companion object {
        val HOSTS = setOf("vimeo.com", "www.vimeo.com", "player.vimeo.com")
    }
}

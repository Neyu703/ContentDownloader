package expo.modules.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadJobTest {

    @Test
    fun `constructor defaults leave optional fields null and phase queued`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")

        assertEquals(JobPhase.QUEUED, job.phase)
        assertNull(job.groupId)
        assertNull(job.groupTitle)
        assertNull(job.title)
        assertNull(job.progress)
        assertNull(job.etaSeconds)
        assertEquals("", job.lastLine)
        assertNull(job.lastLineKey)
        assertNull(job.lastLineParams)
        assertNull(job.filePath)
        assertNull(job.ext)
        assertNull(job.error)
        assertNull(job.errorParams)
        assertNull(job.startedAt)
        assertNull(job.finishedAt)
        assertEquals(job.createdAt, job.updatedAt)
    }

    @Test
    fun `constructor accepts explicit group fields`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "video", "1080", "g1", "My Playlist")

        assertEquals("g1", job.groupId)
        assertEquals("My Playlist", job.groupTitle)
    }

    @Test
    fun `toMap mirrors every field, converting Long timestamps to Double`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320", "g1", "My Playlist")
        job.phase = JobPhase.DOWNLOADING
        job.title = "A Video"
        job.progress = 42.5
        job.etaSeconds = 30L
        job.lastLine = "[download] 42%"
        job.lastLineKey = "job.retrying"
        job.lastLineParams = mapOf("attempt" to 2, "maxAttempts" to 3)
        job.filePath = "/cache/x.mp3"
        job.ext = "mp3"
        job.error = "errors.raw"
        job.errorParams = mapOf("raw" to "boom")
        job.startedAt = 100L
        job.finishedAt = 200L
        job.updatedAt = 150L

        val map = job.toMap()

        assertEquals("id-1", map["id"])
        assertEquals("https://youtu.be/x", map["url"])
        assertEquals("audio", map["format"])
        assertEquals("320", map["quality"])
        assertEquals("g1", map["groupId"])
        assertEquals("My Playlist", map["groupTitle"])
        assertEquals("downloading", map["phase"])
        assertEquals("A Video", map["title"])
        assertEquals(42.5, map["progress"])
        assertEquals(30.0, map["etaSeconds"])
        assertEquals("[download] 42%", map["lastLine"])
        assertEquals("job.retrying", map["lastLineKey"])
        assertEquals(mapOf("attempt" to 2, "maxAttempts" to 3), map["lastLineParams"])
        assertEquals("/cache/x.mp3", map["filePath"])
        assertEquals("mp3", map["ext"])
        assertEquals("errors.raw", map["error"])
        assertEquals(mapOf("raw" to "boom"), map["errorParams"])
        assertEquals(job.createdAt.toDouble(), map["createdAt"])
        assertEquals(100.0, map["startedAt"])
        assertEquals(200.0, map["finishedAt"])
        assertEquals(150.0, map["updatedAt"])
    }

    @Test
    fun `toMap maps null etaSeconds, startedAt and finishedAt through as null`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")

        val map = job.toMap()

        assertNull(map["etaSeconds"])
        assertNull(map["startedAt"])
        assertNull(map["finishedAt"])
        assertNull(map["lastLineKey"])
        assertNull(map["lastLineParams"])
        assertNull(map["error"])
        assertNull(map["errorParams"])
    }

    @Test
    fun `JobPhase isFinished is true only for done, error and cancelled`() {
        assertTrue(JobPhase.DONE.isFinished)
        assertTrue(JobPhase.ERROR.isFinished)
        assertTrue(JobPhase.CANCELLED.isFinished)
        assertEquals(false, JobPhase.QUEUED.isFinished)
        assertEquals(false, JobPhase.FETCHING_INFO.isFinished)
        assertEquals(false, JobPhase.DOWNLOADING.isFinished)
        assertEquals(false, JobPhase.CONVERTING.isFinished)
        assertEquals(false, JobPhase.MERGING.isFinished)
    }

    @Test
    fun `every JobPhase and SetupPhase exposes its mirrored jsName`() {
        assertEquals("queued", JobPhase.QUEUED.jsName)
        assertEquals("fetching_info", JobPhase.FETCHING_INFO.jsName)
        assertEquals("downloading", JobPhase.DOWNLOADING.jsName)
        assertEquals("converting", JobPhase.CONVERTING.jsName)
        assertEquals("merging", JobPhase.MERGING.jsName)
        assertEquals("done", JobPhase.DONE.jsName)
        assertEquals("error", JobPhase.ERROR.jsName)
        assertEquals("cancelled", JobPhase.CANCELLED.jsName)

        assertEquals("idle", SetupPhase.IDLE.jsName)
        assertEquals("preparing", SetupPhase.PREPARING.jsName)
        assertEquals("updating", SetupPhase.UPDATING.jsName)
        assertEquals("ready", SetupPhase.READY.jsName)
        assertEquals("failed", SetupPhase.FAILED.jsName)
    }
}

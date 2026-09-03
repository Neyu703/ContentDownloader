package expo.modules.ytdlp

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class DownloadQueueTest {
    private lateinit var context: Context
    private lateinit var engine: YtdlpEngine
    private lateinit var ffmpeg: FfmpegEngine

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        engine = mockk(relaxed = true)
        ffmpeg = mockk(relaxed = true)
        DownloadQueue.engine = engine
        DownloadQueue.ffmpeg = ffmpeg
        resetDownloadQueueState()
    }

    /** [DownloadQueue] is a process-wide singleton; each test needs a clean slate. */
    private fun resetDownloadQueueState() {
        (privateField("jobs").get(DownloadQueue) as MutableList<*>).clear()
        (privateField("coroutines").get(DownloadQueue) as MutableMap<*, *>).clear()
        privateField("setupPhase").set(DownloadQueue, SetupPhase.IDLE)
        privateField("setupMessage").set(DownloadQueue, "")
        privateField("ytdlpVersion").set(DownloadQueue, null)
        @Suppress("UNCHECKED_CAST")
        (privateField("_revision").get(DownloadQueue) as MutableStateFlow<Long>).value = 0L
    }

    private fun privateField(name: String) =
        DownloadQueue::class.java.getDeclaredField(name).apply { isAccessible = true }

    private fun seedJob(job: DownloadJob, coroutineJob: Job? = null) {
        @Suppress("UNCHECKED_CAST")
        (privateField("jobs").get(DownloadQueue) as MutableList<DownloadJob>).add(job)
        if (coroutineJob != null) {
            @Suppress("UNCHECKED_CAST")
            (privateField("coroutines").get(DownloadQueue) as MutableMap<String, Job>)[job.id] = coroutineJob
        }
    }

    private fun response(out: String) = YoutubeDLResponse(emptyList(), 0, 0L, out, "")

    // --- hasPendingWork() / activeJob() / queuedCount() ---

    @Test
    fun `hasPendingWork is true while setup is PREPARING, even with no jobs`() {
        privateField("setupPhase").set(DownloadQueue, SetupPhase.PREPARING)
        assertTrue(DownloadQueue.hasPendingWork())
    }

    @Test
    fun `hasPendingWork is true while setup is UPDATING, even with no jobs`() {
        privateField("setupPhase").set(DownloadQueue, SetupPhase.UPDATING)
        assertTrue(DownloadQueue.hasPendingWork())
    }

    @Test
    fun `hasPendingWork is true when a job is still active, even with setup READY`() {
        privateField("setupPhase").set(DownloadQueue, SetupPhase.READY)
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        assertTrue(DownloadQueue.hasPendingWork())
    }

    @Test
    fun `hasPendingWork is false when setup is READY and no job is active`() {
        privateField("setupPhase").set(DownloadQueue, SetupPhase.READY)
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { phase = JobPhase.DONE })
        assertFalse(DownloadQueue.hasPendingWork())
    }

    @Test
    fun `activeJob skips queued jobs and finished jobs, returning the first job actually running`() {
        seedJob(DownloadJob("queued", "https://youtu.be/a", "audio", "320"))
        seedJob(DownloadJob("done", "https://youtu.be/b", "audio", "320").apply { phase = JobPhase.DONE })
        val running = DownloadJob("running", "https://youtu.be/c", "audio", "320").apply { phase = JobPhase.DOWNLOADING }
        seedJob(running)

        assertEquals(running, DownloadQueue.activeJob())
    }

    @Test
    fun `activeJob is null when every job is queued or finished`() {
        seedJob(DownloadJob("queued", "https://youtu.be/a", "audio", "320"))
        seedJob(DownloadJob("done", "https://youtu.be/b", "audio", "320").apply { phase = JobPhase.DONE })

        assertNull(DownloadQueue.activeJob())
    }

    // --- prepare() ---

    @Test
    fun `prepare initializes engine and ffmpeg, then reaches READY with the fetched version`() = runTest {
        every { engine.version(any()) } returns "2024.1.1"

        DownloadQueue.prepare(context)

        verify { engine.init(any()) }
        verify { ffmpeg.init(any()) }
        assertEquals(SetupPhase.READY, DownloadQueue.setupPhase)
        assertEquals("2024.1.1", DownloadQueue.ytdlpVersion)
        assertTrue(DownloadQueue.setupMessage.contains("2024.1.1"))
    }

    @Test
    fun `prepare is a no-op once already READY`() = runTest {
        every { engine.version(any()) } returns "1.0"
        DownloadQueue.prepare(context)

        DownloadQueue.prepare(context)

        verify(exactly = 1) { engine.init(any()) }
    }

    @Test
    fun `prepare keeps the bundled version and still reaches READY when the update check fails`() = runTest {
        every { engine.version(any()) } returns "bundled-1.0"
        every { engine.updateYoutubeDL(any(), any()) } throws RuntimeException("offline")

        DownloadQueue.prepare(context)

        assertEquals(SetupPhase.READY, DownloadQueue.setupPhase)
        assertEquals("bundled-1.0", DownloadQueue.ytdlpVersion)
    }

    @Test
    fun `prepare falls back to a placeholder in the READY message when the version is unknown`() = runTest {
        every { engine.version(any()) } returns null

        DownloadQueue.prepare(context)

        assertEquals(SetupPhase.READY, DownloadQueue.setupPhase)
        assertEquals("yt-dlp ? bereit", DownloadQueue.setupMessage)
    }

    @Test
    fun `prepare sets FAILED and rethrows when init fails`() = runTest {
        every { engine.init(any()) } throws IllegalStateException("no native binary")

        val error = runCatching { DownloadQueue.prepare(context) }.exceptionOrNull()

        assertEquals("no native binary", error?.message)
        assertEquals(SetupPhase.FAILED, DownloadQueue.setupPhase)
        assertEquals("no native binary", DownloadQueue.setupMessage)
    }

    // --- enqueue() ---

    @Test
    fun `enqueue synchronously records a queued job with the given fields`() {
        val id = DownloadQueue.enqueue(context, "https://youtu.be/x", "audio", "320", "g1", "My Playlist")

        val job = (DownloadQueue.snapshot()["jobs"] as List<*>).single() as Map<*, *>
        assertEquals(id, job["id"])
        assertEquals("https://youtu.be/x", job["url"])
        assertEquals("audio", job["format"])
        assertEquals("320", job["quality"])
        assertEquals("g1", job["groupId"])
        assertEquals("My Playlist", job["groupTitle"])
        assertEquals("queued", job["phase"])
    }

    @Test
    fun `enqueue defaults groupId and groupTitle to null`() {
        DownloadQueue.enqueue(context, "https://youtu.be/x", "audio", "320")

        val job = (DownloadQueue.snapshot()["jobs"] as List<*>).single() as Map<*, *>
        assertNull(job["groupId"])
        assertNull(job["groupTitle"])
    }

    // --- getPlaylistInfo() ---

    @Test
    fun `getPlaylistInfo rejects a non-YouTube url without touching the engine`() = runTest {
        val error = runCatching { DownloadQueue.getPlaylistInfo(context, "https://vimeo.com/x") }.exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
        assertEquals("Ungültiger Link – nur YouTube wird unterstützt.", error?.message)
        verify(exactly = 0) { engine.execute(any(), any(), any(), any()) }
    }

    @Test
    fun `getPlaylistInfo parses title, entries and totalCount from the flat-playlist output`() = runTest {
        val output = """
            {"id":"a","title":"Video A","playlist_title":"My Mix","playlist_count":2}
            {"id":"b","title":"Video B"}
        """.trimIndent()
        every { engine.execute(any(), any(), any(), null) } returns response(output)

        val result = DownloadQueue.getPlaylistInfo(context, "https://youtu.be/x")

        assertEquals("My Mix", result["title"])
        assertEquals(2, result["totalCount"])
        val entries = result["entries"] as List<*>
        assertEquals(2, entries.size)
    }

    @Test
    fun `getPlaylistInfo defaults to an untitled playlist with no known total when the output has no matches`() = runTest {
        every { engine.execute(any(), any(), any(), null) } returns response("")

        val result = DownloadQueue.getPlaylistInfo(context, "https://youtu.be/x")

        assertEquals("Playlist", result["title"])
        assertNull(result["totalCount"])
        assertEquals(emptyList<Any?>(), result["entries"])
    }

    @Test
    fun `getPlaylistInfo defaults title and totalCount when the first entry carries neither key`() = runTest {
        every { engine.execute(any(), any(), any(), null) } returns response("""{"id":"a","title":"Video A"}""")

        val result = DownloadQueue.getPlaylistInfo(context, "https://youtu.be/x")

        assertEquals("Playlist", result["title"])
        assertNull(result["totalCount"])
    }

    @Test
    fun `getPlaylistInfo requests the correct playlist-items range`() = runTest {
        val requestSlot = slot<YoutubeDLRequest>()
        every { engine.execute(capture(requestSlot), any(), any(), null) } returns response("")

        DownloadQueue.getPlaylistInfo(context, "https://youtu.be/x", start = 51, count = 50)

        assertEquals("51-100", requestSlot.captured.getOption("--playlist-items"))
    }

    // --- cancel() ---

    @Test
    fun `cancel is a no-op for an unknown id`() {
        DownloadQueue.cancel("does-not-exist")
        assertTrue((DownloadQueue.snapshot()["jobs"] as List<*>).isEmpty())
    }

    @Test
    fun `cancel is a no-op for an already finished job`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { phase = JobPhase.DONE }
        seedJob(job)

        DownloadQueue.cancel("id-1")

        assertEquals(1, (DownloadQueue.snapshot()["jobs"] as List<*>).size)
    }

    @Test
    fun `cancel marks an active job cancelled, removes it and cancels its coroutine`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        val coroutineJob = Job()
        seedJob(job, coroutineJob)

        DownloadQueue.cancel("id-1")

        assertEquals(JobPhase.CANCELLED, job.phase)
        assertNotNull(job.finishedAt)
        assertTrue((DownloadQueue.snapshot()["jobs"] as List<*>).isEmpty())
        assertTrue(coroutineJob.isCancelled)
        verify(timeout = 1000) { engine.destroyProcessById("id-1") }
    }

    @Test
    fun `cancel does not propagate a failure from destroyProcessById`() {
        every { engine.destroyProcessById("id-1") } throws RuntimeException("no such process")
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        seedJob(job)

        DownloadQueue.cancel("id-1")

        verify(timeout = 1000) { engine.destroyProcessById("id-1") }
        assertEquals(JobPhase.CANCELLED, job.phase)
    }

    // --- cancelAll() ---

    @Test
    fun `cancelAll cancels only the non-finished jobs`() {
        val active1 = DownloadJob("a", "https://youtu.be/a", "audio", "320")
        val active2 = DownloadJob("b", "https://youtu.be/b", "audio", "320")
        val finished = DownloadJob("c", "https://youtu.be/c", "audio", "320").apply { phase = JobPhase.DONE }
        seedJob(active1)
        seedJob(active2)
        seedJob(finished)

        DownloadQueue.cancelAll()

        val remaining = (DownloadQueue.snapshot()["jobs"] as List<*>).map { (it as Map<*, *>)["id"] }
        assertEquals(listOf("c"), remaining)
    }

    // --- clearFinished() ---

    @Test
    fun `clearFinished removes finished jobs and deletes their files`() {
        val file = File.createTempFile("clear-finished-test", ".mp3")
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            phase = JobPhase.DONE
            filePath = file.absolutePath
        }
        seedJob(job)

        DownloadQueue.clearFinished()

        assertTrue((DownloadQueue.snapshot()["jobs"] as List<*>).isEmpty())
        assertFalse(file.exists())
    }

    @Test
    fun `clearFinished tolerates a job whose file is already gone`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            phase = JobPhase.DONE
            filePath = File(context.cacheDir, "already-deleted.mp3").absolutePath
        }
        seedJob(job)

        DownloadQueue.clearFinished()

        assertTrue((DownloadQueue.snapshot()["jobs"] as List<*>).isEmpty())
    }

    @Test
    fun `clearFinished leaves active jobs untouched`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        seedJob(job)

        DownloadQueue.clearFinished()

        assertEquals(1, (DownloadQueue.snapshot()["jobs"] as List<*>).size)
    }

    // --- runJob() ---

    @Test
    fun `runJob returns immediately for an already-cancelled job`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { phase = JobPhase.CANCELLED }

        DownloadQueue.runJob(context, job)

        verify(exactly = 0) { engine.init(any()) }
    }

    @Test
    fun `runJob sets ERROR for an invalid url without touching the engine`() = runTest {
        val job = DownloadJob("id-1", "https://vimeo.com/x", "audio", "320")

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.ERROR, job.phase)
        assertEquals("Ungültiger Link – nur YouTube wird unterstützt.", job.error)
        verify(exactly = 0) { engine.init(any()) }
    }

    @Test
    fun `runJob stops after prepare() if the job was cancelled meanwhile, without overwriting an existing finishedAt`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { finishedAt = 999L }
        every { engine.init(any()) } answers { job.phase = JobPhase.CANCELLED }

        DownloadQueue.runJob(context, job)

        verify(exactly = 0) { engine.execute(any(), any(), any(), any()) }
        assertEquals(999L, job.finishedAt)
    }

    @Test
    fun `runJob stops after fetchTitle if the job was cancelled meanwhile`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } answers {
            job.phase = JobPhase.CANCELLED
            response("A Title")
        }

        DownloadQueue.runJob(context, job)

        verify(exactly = 0) { engine.execute(any(), any(), any(), isNull(inverse = true)) }
    }

    @Test
    fun `runJob downloads successfully end to end and marks the job DONE`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("My Video Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } answers {
            val request = firstArg<YoutubeDLRequest>()
            val callback = arg<(Float, Long, String) -> Unit>(3)
            callback(50f, 12L, "[download] 50%")
            File(request.getOption("-o")!!.replace("%(ext)s", "mp3")).apply { writeText("audio-bytes") }
            response("")
        }

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.DONE, job.phase)
        assertEquals("My Video Title", job.title)
        assertEquals("mp3", job.ext)
        assertEquals(100.0, job.progress)
        assertEquals(0L, job.etaSeconds)
        assertNotNull(job.filePath)
        assertTrue(File(job.filePath!!).name.startsWith("My Video Title"))
        assertNotNull(job.finishedAt)
    }

    @Test
    fun `runJob downloads a video job successfully, using the mp4 extension`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "video", "720")
        every { engine.execute(any(), any(), any(), null) } returns response("My Video Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } answers {
            val request = firstArg<YoutubeDLRequest>()
            File(request.getOption("-o")!!.replace("%(ext)s", "mp4")).apply { writeText("video-bytes") }
            response("")
        }

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.DONE, job.phase)
        assertEquals("mp4", job.ext)
    }

    @Test
    fun `runJob sets ERROR when yt-dlp reports success but produces no file`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } returns response("")

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.ERROR, job.phase)
        assertEquals("yt-dlp hat keine Datei erzeugt.", job.error)
    }

    @Test
    fun `runJob catches a CanceledException from the engine and marks the job CANCELLED`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } throws YoutubeDL.CanceledException()

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.CANCELLED, job.phase)
    }

    @Test
    fun `runJob catches a CancellationException, marks CANCELLED and rethrows`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } throws CancellationException("stopped")

        val error = runCatching { DownloadQueue.runJob(context, job) }.exceptionOrNull()

        assertTrue(error is CancellationException)
        assertEquals(JobPhase.CANCELLED, job.phase)
    }

    @Test
    fun `runJob catches a generic failure and stores its message as the job error`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } throws IllegalStateException("boom")

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.ERROR, job.phase)
        assertEquals("boom", job.error)
    }

    // --- runJob() retry ---

    @Test
    fun `runJob retries a transient download failure once and succeeds on the second attempt`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        var callCount = 0
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } answers {
            callCount++
            if (callCount == 1) {
                throw RuntimeException("HTTP Error 403: Forbidden")
            }
            val request = firstArg<YoutubeDLRequest>()
            File(request.getOption("-o")!!.replace("%(ext)s", "mp3")).apply { writeText("audio-bytes") }
            response("")
        }

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.DONE, job.phase)
        assertEquals(2, callCount)
    }

    @Test
    fun `runJob exhausts all attempts on repeated transient failures and marks the job ERROR`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } throws RuntimeException("HTTP Error 403: Forbidden")

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.ERROR, job.phase)
        assertEquals("HTTP Error 403: Forbidden", job.error)
        verify(exactly = 3) { engine.execute(any(), any(), any(), isNull(inverse = true)) }
    }

    @Test
    fun `runJob does not retry the known-permanent sign-in gate failure`() = runTest {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title")
        every {
            engine.execute(any(), any(), any(), isNull(inverse = true))
        } throws RuntimeException("ERROR: Sign in to confirm you're not a bot")

        DownloadQueue.runJob(context, job)

        assertEquals(JobPhase.ERROR, job.phase)
        assertEquals(
            "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden.",
            job.error
        )
        verify(exactly = 1) { engine.execute(any(), any(), any(), isNull(inverse = true)) }
    }

    // --- isRetryableError() ---

    @Test
    fun `isRetryableError is false for the known-permanent sign-in gate`() {
        assertFalse(DownloadQueue.isRetryableError(RuntimeException("ERROR: Sign in to confirm you're not a bot")))
    }

    @Test
    fun `isRetryableError is true for any other error`() {
        assertTrue(DownloadQueue.isRetryableError(RuntimeException("HTTP Error 403: Forbidden")))
    }

    // --- fetchTitle() ---

    @Test
    fun `fetchTitle returns the last non-empty output line`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title\n\n")

        assertEquals("A Title", DownloadQueue.fetchTitle(job))
    }

    @Test
    fun `fetchTitle falls back to the job url when the output is blank`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("   ")

        assertEquals(job.url, DownloadQueue.fetchTitle(job))
    }

    // --- sanitizeFilename() / renameToTitledFile() ---

    @Test
    fun `sanitizeFilename strips filesystem-illegal characters`() {
        assertEquals("My Video", DownloadQueue.sanitizeFilename("My/ Video:*?\"<>|"))
    }

    @Test
    fun `sanitizeFilename falls back to download when nothing legal remains`() {
        assertEquals("download", DownloadQueue.sanitizeFilename("///:::"))
    }

    @Test
    fun `renameToTitledFile renames the source to a sanitized title-based name`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        val source = File(dir, "job-id.mp3").apply { writeText("x") }

        val result = DownloadQueue.renameToTitledFile(source, "My Video", "mp3")

        assertEquals("My Video.mp3", result.name)
        assertTrue(result.exists())
        assertFalse(source.exists())
    }

    @Test
    fun `renameToTitledFile appends a counter suffix when the target name already exists`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        File(dir, "My Video.mp3").writeText("existing")
        val source = File(dir, "job-id.mp3").apply { writeText("new") }

        val result = DownloadQueue.renameToTitledFile(source, "My Video", "mp3")

        assertEquals("My Video (2).mp3", result.name)
    }

    @Test
    fun `renameToTitledFile leaves the file in place when the candidate already equals the source`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        val source = File(dir, "My Video.mp3").apply { writeText("x") }

        val result = DownloadQueue.renameToTitledFile(source, "My Video", "mp3")

        assertEquals(source.absolutePath, result.absolutePath)
        assertTrue(result.exists())
    }

    @Test
    fun `renameToTitledFile returns the original source unchanged when the rename itself fails`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        val source = File(dir, "job-id.mp3").apply { writeText("x") }
        // Windows refuses to rename a file that's still open elsewhere; holding a stream open on
        // it here is a reliable, portable-enough way to make source.renameTo(candidate) fail.
        source.inputStream().use {
            val result = DownloadQueue.renameToTitledFile(source, "My Video", "mp3")

            assertEquals(source.absolutePath, result.absolutePath)
            assertTrue(source.exists())
        }
    }

    // --- downloadAndFinalize() ---

    @Test
    fun `downloadAndFinalize falls back to the job url for the filename when no title was resolved`() {
        val job = DownloadJob("id-1", "https://youtu.be/my-video-id", "audio", "320")
        every { engine.execute(any(), any(), any(), isNull(inverse = true)) } answers {
            val request = firstArg<YoutubeDLRequest>()
            File(request.getOption("-o")!!.replace("%(ext)s", "mp3")).apply { writeText("audio-bytes") }
            response("")
        }
        val outputDir = File(context.cacheDir, "download-finalize-test-${System.nanoTime()}").apply { mkdirs() }

        DownloadQueue.downloadAndFinalize(job, outputDir, "mp3")

        assertNotNull(job.filePath)
        assertTrue(File(job.filePath!!).name.contains("youtu.be"))
    }

    // --- buildRequest() ---

    @Test
    fun `buildRequest builds the audio extraction options`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "192")

        val request = DownloadQueue.buildRequest(job, "/out/%(ext)s")

        assertEquals("bestaudio/best", request.getOption("-f"))
        assertTrue(request.hasOption("-x"))
        assertEquals("mp3", request.getOption("--audio-format"))
        assertEquals("192K", request.getOption("--audio-quality"))
    }

    @Test
    fun `buildRequest applies a height filter for a specific video quality`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "video", "720")

        val request = DownloadQueue.buildRequest(job, "/out/%(ext)s")

        assertEquals(
            "bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]",
            request.getOption("-f")
        )
        assertEquals("mp4", request.getOption("--merge-output-format"))
    }

    @Test
    fun `buildRequest omits the height filter for the best video quality`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "video", "best")

        val request = DownloadQueue.buildRequest(job, "/out/%(ext)s")

        assertEquals("bestvideo+bestaudio/best/best", request.getOption("-f"))
    }

    // --- onOutput() ---

    @Test
    fun `onOutput is a no-op once the job is already finished`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            phase = JobPhase.DONE
            lastLine = "unchanged"
        }

        DownloadQueue.onOutput(job, 42f, 10L, "new line")

        assertEquals("unchanged", job.lastLine)
    }

    @Test
    fun `onOutput updates lastLine, progress and eta from non-negative values`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")

        DownloadQueue.onOutput(job, 42f, 10L, "  [download] 42%  ")

        assertEquals("[download] 42%", job.lastLine)
        assertEquals(42.0, job.progress)
        assertEquals(10L, job.etaSeconds)
    }

    @Test
    fun `onOutput ignores negative sentinel progress and eta values`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            progress = 10.0
            etaSeconds = 5L
        }

        DownloadQueue.onOutput(job, -1f, -1L, "line")

        assertEquals(10.0, job.progress)
        assertEquals(5L, job.etaSeconds)
    }

    @Test
    fun `onOutput leaves lastLine untouched for a blank line`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { lastLine = "kept" }

        DownloadQueue.onOutput(job, 0f, 0L, "   ")

        assertEquals("kept", job.lastLine)
    }

    @Test
    fun `onOutput switches phase to MERGING on a Merger line`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "video", "720")

        DownloadQueue.onOutput(job, 0f, 0L, "[Merger] Merging formats")

        assertEquals(JobPhase.MERGING, job.phase)
    }

    @Test
    fun `onOutput switches phase to CONVERTING on an ExtractAudio line`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")

        DownloadQueue.onOutput(job, 0f, 0L, "[ExtractAudio] Destination: x.mp3")

        assertEquals(JobPhase.CONVERTING, job.phase)
    }

    @Test
    fun `onOutput switches phase to CONVERTING on an ffmpeg line`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")

        DownloadQueue.onOutput(job, 0f, 0L, "[ffmpeg] Converting")

        assertEquals(JobPhase.CONVERTING, job.phase)
    }

    // --- describeError() / describeErrorRaw() ---

    @Test
    fun `describeError replaces the message with a friendly one when the sign-in gate matches`() {
        val error = RuntimeException("ERROR: Sign in to confirm you're not a bot")
        assertEquals(
            "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden.",
            DownloadQueue.describeError(error)
        )
    }

    @Test
    fun `describeError passes an unrelated message through unchanged`() {
        assertEquals("boom", DownloadQueue.describeError(RuntimeException("boom")))
    }

    @Test
    fun `describeErrorRaw strips the ERROR prefix from the last non-empty line`() {
        val error = RuntimeException("WARNING: ignored\n\nERROR: the real reason")
        assertEquals("the real reason", DownloadQueue.describeErrorRaw(error))
    }

    @Test
    fun `describeErrorRaw walks the cause chain when the top message is blank`() {
        val cause = IllegalStateException("root cause")
        val wrapper = RuntimeException(null, cause)

        assertEquals("IllegalStateException: root cause", DownloadQueue.describeErrorRaw(wrapper))
    }

    @Test
    fun `describeErrorRaw skips a cause with a blank message and keeps walking`() {
        val root = IllegalStateException("real reason")
        val blankCause = RuntimeException("   ", root)
        val wrapper = RuntimeException(null, blankCause)

        assertEquals("IllegalStateException: real reason", DownloadQueue.describeErrorRaw(wrapper))
    }

    @Test
    fun `describeErrorRaw falls back to the class name when no message exists anywhere`() {
        val wrapper = RuntimeException(null, RuntimeException())
        assertEquals("RuntimeException", DownloadQueue.describeErrorRaw(wrapper))
    }
}

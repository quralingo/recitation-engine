package com.quralingo.recitation

import ai.quranlab.tajweedformer.*
import android.app.AlertDialog
import android.content.pm.PackageManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class RecitationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val gate = Mutex()
    private var client: TajweedClient? = null
    private var model: TajweedModel? = null
    private var session: TajweedSession? = null
    private var sessionId: String? = null
    private var running = false
    private var external = false
    private var rate = 16000
    private var chunksJob: Job? = null
    private var eventsJob: Job? = null
    private var lastChunk: Map<String, Any?>? = null
    override fun getName() = "QuralingoRecitation"
    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun command(promise: Promise, body: suspend () -> Any?) {
        scope.launch {
            try { promise.resolve(gate.withLock { wire(body()) }) }
            catch (e: Exception) { promise.reject(if (e is TajweedError) e.code else "recitation_error", e.message, e) }
        }
    }
    private fun requireSession(id: String): TajweedSession {
        check(sessionId == id) { "Session id mismatch" }
        return checkNotNull(session) { "No session" }
    }
    @ReactMethod fun configure(config: ReadableMap, promise: Promise) = command(promise) {
        check(!running) { "Stop the current session" }
        val suppliedKey = if (config.hasKey("apiKey") && !config.isNull("apiKey")) config.getString("apiKey") else null
        val key = suppliedKey ?: context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
            .metaData?.getString("com.quralingo.recitation.API_KEY")
        check(!key.isNullOrBlank()) { "missing_configuration: set com.quralingo.recitation.API_KEY in application metadata or call configure with apiKey" }
        chunksJob?.cancelAndJoin(); eventsJob?.cancelAndJoin()
        client?.close(); client = null; model = null; session = null; sessionId = null
        client = TajweedClient(context, key, TajweedClientOptions(
            analytics = TajweedClientOptions.Analytics.OFF,
            audience = if (config.getString("audience") == "general") TajweedClientOptions.Audience.GENERAL else TajweedClientOptions.Audience.CHILDREN))
        null
    }
    @ReactMethod fun loadModel(promise: Promise) = command(promise) {
        check(!running) { "Stop the current session" }
        val configuredClient = checkNotNull(client) { "Configure first" }
        configuredClient.prefetch()
        val m = configuredClient.model()
        model = m
        mapOf("version" to m.version, "build" to m.build, "tokens" to m.tokens.names,
            "blank" to m.tokens.blank, "wordBar" to m.tokens.wordBar, "referenceAvailable" to (m.reference != null),
            "calibration" to m.calibration?.let { mapOf("json" to it.json, "sha256" to it.sha256) })
    }
    @ReactMethod fun reference(surah: Int, ayah: Int, promise: Promise) = command(promise) {
        val m = checkNotNull(model) { "Load model first" }
        val ref = checkNotNull(m.reference) { "reference_missing: supply verified phonemes" }
        ref.fetch()
        val words = mutableListOf<List<String>>()
        var current = mutableListOf<String>()
        ref.units(surah, ayah).forEach { id ->
            if (id == m.tokens.wordBar) { if (current.isNotEmpty()) words.add(current); current = mutableListOf() }
            else if (id != m.tokens.blank) current.add(m.tokens.name(id))
        }
        if (current.isNotEmpty()) words.add(current)
        words
    }
    @ReactMethod fun start(id: String, options: ReadableMap, promise: Promise) = command(promise) {
        check(!running) { "A session is running" }
        chunksJob?.join(); eventsJob?.cancelAndJoin()
        val m = checkNotNull(model) { "Load model first" }
        val o = TajweedSessionOptions(context = options.getString("context"), sampleRate = options.getInt("sampleRate"),
            heads = if (options.getBoolean("allHeads")) listOf("all") else null,
            backend = if (options.getString("backend") == "cpu") TajweedSessionOptions.Backend.CPU else TajweedSessionOptions.Backend.AUTO,
            endOnSilenceMs = options.getInt("endOnSilenceMs"))
        external = options.getString("source") == "external"; rate = o.sampleRate
        val s = if (external) m.session(o) else m.listen(o)
        session = s; sessionId = id; running = true; lastChunk = null
        chunksJob = scope.launch {
            try {
                s.chunks.collect { c ->
                    val payload = chunk(id, c.index, c.startMs, c.endMs, c.backend.name, c.decoded, c.heads)
                    lastChunk = payload
                    emit("QuralingoRecitationChunk", payload)
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { emit("QuralingoRecitationEvent", mapOf("sessionId" to id, "type" to "error", "code" to (if (e is TajweedError) e.code else "stream_error"), "message" to e.message)) }
            finally { if (sessionId == id) running = false }
        }
        eventsJob = scope.launch { s.events.collect { e ->
            val event = mutableMapOf<String, Any?>("sessionId" to id)
            when (e) {
                is TajweedEvent.SpeechStarted -> { event["type"] = "speechStarted"; event["atMs"] = e.atMs }
                is TajweedEvent.SpeechEnded -> { event["type"] = "speechEnded"; event["atMs"] = e.atMs; event["silenceMs"] = e.silenceMs }
                is TajweedEvent.Interrupted -> { event["type"] = "interrupted"; event["cause"] = e.cause.name }
                is TajweedEvent.Resumed -> event["type"] = "resumed"
                is TajweedEvent.BackendChanged -> { event["type"] = "backendChanged"; event["fromChunk"] = e.fromChunk; event["backend"] = e.backend.name }
                is TajweedEvent.Ended -> { event["type"] = "ended"; event["reason"] = e.reason.name; event["code"] = e.error?.code; event["message"] = e.error?.message }
            }
            emit("QuralingoRecitationEvent", event)
        } }
        null
    }
    @ReactMethod fun pushAudio(id: String, samples: ReadableArray, promise: Promise) = command(promise) {
        check(external && running && samples.size() in 1..rate) { "Invalid external audio push" }
        val data = FloatArray(samples.size()) { i -> samples.getDouble(i).toFloat().also { require(it.isFinite() && it in -1f..1f) } }
        requireSession(id).push(data)
        null
    }
    @ReactMethod fun stop(id: String, promise: Promise) = command(promise) {
        val s = requireSession(id)
        val h = s.finish()
        chunksJob?.join(); running = false
        val d = h.decoded()
        // Chunks already carried the heads. Do not duplicate a whole 20-minute take over the bridge.
        lastChunk ?: chunk(id, -1, 0, d.tokens.lastOrNull()?.lastMs ?: 0, s.backend.name, d, h)
    }
    @ReactMethod fun cancel(id: String, promise: Promise) = command(promise) {
        requireSession(id).cancel()
        chunksJob?.cancelAndJoin(); eventsJob?.cancelAndJoin()
        session = null; sessionId = null; running = false
        null
    }
    @ReactMethod fun showSharingSettings(promise: Promise) = command(promise) {
        val activity = checkNotNull(reactApplicationContext.currentActivity) { "No foreground activity" }
        val c = checkNotNull(client) { "Configure first" }
        AlertDialog.Builder(activity).setTitle("Quran Lab recording sharing")
            .setView(SharingSettingsView(activity, c)).setPositiveButton("Close", null).show()
        null
    }
    private fun chunk(id: String, index: Int, start: Long, end: Long, backend: String, d: TajweedDecoded, heads: TajweedHeads): Map<String, Any?> = mapOf(
        "sessionId" to id, "index" to index, "startMs" to start, "endMs" to end, "backend" to backend,
        "decoded" to mapOf("text" to d.text, "settled" to d.settled, "isFinal" to d.isFinal,
            "tokens" to d.tokens.map { t -> mapOf("id" to t.id, "name" to t.name, "firstMs" to t.firstMs, "peakMs" to t.peakMs, "lastMs" to t.lastMs, "confidence" to t.confidence) }),
        "heads" to heads.names.mapNotNull { name -> heads[name]?.let { h -> mapOf("name" to h.name, "kind" to h.kind.name,
            "frameMs" to h.frameMs, "frames" to h.frames, "classes" to h.classes, "values" to h.values.toList()) } })

    private fun emit(name: String, value: Map<String, Any?>) {
        if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, wire(value))
    }
    // Avoid bridge crashes on Int64/FloatArray and invalid JSON numbers.
    private fun wire(value: Any?): Any? = when (value) {
        null -> null
        is Map<*, *> -> Arguments.createMap().also { out -> value.forEach { (k, v) ->
            when (val w = wire(v)) { null -> out.putNull(k as String); is String -> out.putString(k as String, w)
                is Boolean -> out.putBoolean(k as String, w); is Double -> out.putDouble(k as String, w)
                is WritableMap -> out.putMap(k as String, w); is WritableArray -> out.putArray(k as String, w) }
        } }
        is List<*> -> Arguments.createArray().also { out -> value.forEach { v ->
            when (val w = wire(v)) { null -> out.pushNull(); is String -> out.pushString(w); is Boolean -> out.pushBoolean(w)
                is Double -> out.pushDouble(w); is WritableMap -> out.pushMap(w); is WritableArray -> out.pushArray(w) }
        } }
        is Number -> value.toDouble().takeIf { it.isFinite() }
        else -> value
    }
    override fun invalidate() {
        session?.cancel(); chunksJob?.cancel(); eventsJob?.cancel(); client?.close(); scope.cancel()
        super.invalidate()
    }
}

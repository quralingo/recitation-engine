import Foundation
import React
import TajweedFormer
import UIKit

@objc(QuralingoRecitation)
class QuralingoRecitation: RCTEventEmitter {
    // All state and SDK orchestration run on the main actor. SDK inference owns its own worker.
    @MainActor private var client: TajweedClient?
    @MainActor private var model: TajweedModel?
    @MainActor private var session: TajweedSession?
    @MainActor private var sessionId: String?
    @MainActor private var running = false
    @MainActor private var busy = false
    @MainActor private var external = false
    @MainActor private var rate = 16000
    @MainActor private var chunkTask: Task<Void, Never>?
    @MainActor private var eventTask: Task<Void, Never>?
    @MainActor private var lastModelProgressAt: TimeInterval = 0
    @MainActor private var lastChunk: [String: Any]?
    override static func requiresMainQueueSetup() -> Bool { true }
    override func supportedEvents() -> [String]! { ["QuralingoRecitationChunk", "QuralingoRecitationEvent", "QuralingoRecitationModelProgress"] }

    private func command(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock,
                         _ body: @escaping @MainActor () async throws -> Any?) {
        Task { @MainActor in
            guard !busy else { reject("busy", "A lifecycle operation is in progress", nil); return }
            busy = true
            defer { busy = false }
            do { resolve(try await body()) }
            catch let error as TajweedError { reject(error.code, error.message, error as NSError) }
            catch { reject("recitation_error", error.localizedDescription, error as NSError) }
        }
    }
    @MainActor private func requireSession(_ id: String) throws -> TajweedSession {
        guard id == sessionId, let session else { throw failure("No matching session") }
        return session
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "QuralingoRecitation", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    @objc(configure:resolver:rejecter:)
    func configure(_ config: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard !running else { throw failure("Stop the current session") }
            let configuredKey = config["apiKey"] as? String ?? Bundle.main.object(forInfoDictionaryKey: "QuranLabApiKey") as? String
            guard let key = configuredKey, !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw failure("missing_configuration: set QuranLabApiKey in Info.plist or call configure with apiKey")
            }
            chunkTask?.cancel(); eventTask?.cancel()
            await model?.close()
            model = nil; session = nil; sessionId = nil; client?.close(); client = nil
            client = try TajweedClient(key: key)
            return nil
        }
    }
    @objc(loadModel:rejecter:)
    func loadModel(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard !running, let client else { throw failure("Configure first and stop any session") }
            try await client.prefetch(onProgress: { [weak self] done, total in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let now = Date().timeIntervalSince1970
                    guard now - self.lastModelProgressAt >= 0.1 || done >= total else { return }
                    self.lastModelProgressAt = now
                    self.sendEvent(withName: "QuralingoRecitationModelProgress", body: ["downloadedBytes": done, "totalBytes": total])
                }
            })
            let m = try await client.model()
            // Prepare CPU contexts now; correction remains available without a later download.
            for context in ["c16_l64", "c24_l72"] {
                guard m.contexts.contains(context) else { throw failure("context_missing: \(context) is not shipped by this model") }
                try await m.prepare(options: .init(context: context, sampleRate: 16000, backend: .cpu))
            }
            model = m
            var calibration: Any = NSNull()
            if let c = m.calibration { calibration = ["json": String(decoding: c.data, as: UTF8.self), "sha256": c.sha256] }
            return ["version": m.version, "build": m.build,
                    "tokens": (0..<m.tokens.count).map { m.tokens.name($0) }, "blank": m.tokens.blank,
                    "wordBar": m.tokens.wordBar as Any? ?? NSNull(),
                    "referenceAvailable": m.reference != nil, "calibration": calibration] as [String: Any]
        }
    }
    @objc(getModelStorage:rejecter:)
    func getModelStorage(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard let client else { throw failure("Configure first") }
            return ["models": client.storage.models.map { ["version": $0.version, "build": $0.build, "bytes": $0.bytes] as [String: Any] }]
        }
    }
    @objc(reference:ayah:resolver:rejecter:)
    func reference(_ surah: Int, ayah: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard let m = model, let reference = m.reference else { throw failure("reference_missing: supply verified phonemes") }
            try await reference.fetch()
            let data = try reference.units(surah: surah, ayah: ayah)
            // Apple exposes explicit word starts; exclude blank and word bars.
            return data.wordStarts.enumerated().map { index, start in
                let end = index + 1 < data.wordStarts.count ? data.wordStarts[index + 1] : data.units.count
                return data.units[start..<end].filter { $0 != m.tokens.blank && $0 != m.tokens.wordBar }.map { m.tokens.name($0) }
            }
        }
    }
    @objc(start:options:resolver:rejecter:)
    func start(_ id: String, options: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard !running, let model else { throw failure("Load model and stop any session first") }
            await chunkTask?.value; eventTask?.cancel()
            let sr = (options["sampleRate"] as? NSNumber)?.doubleValue ?? 16000
            let silence = (options["endOnSilenceMs"] as? NSNumber)?.intValue ?? 1500
            let opts = TajweedSessionOptions(context: options["context"] as? String, sampleRate: sr,
                heads: options["allHeads"] as? Bool == true ? TajweedSessionOptions.allHeads : TajweedSessionOptions.defaultHeads,
                backend: options["backend"] as? String == "cpu" ? .cpu : .auto,
                endOnSilenceMs: silence == 0 ? nil : silence)
            external = options["source"] as? String == "external"; rate = Int(sr)
            let s = try await (external ? model.session(options: opts) : model.listen(options: opts))
            session = s; sessionId = id; running = true; lastChunk = nil
            chunkTask = Task { @MainActor [weak self] in
                for await chunk in s.chunks {
                    guard let self, !Task.isCancelled else { break }
                    let body = self.payload(id, chunk.index, chunk.startMs, chunk.endMs, chunk.backend.name, chunk.decoded, chunk.heads)
                    self.lastChunk = body
                    self.sendEvent(withName: "QuralingoRecitationChunk", body: body)
                }
                if self?.sessionId == id { self?.running = false }
            }
            eventTask = Task { @MainActor [weak self] in
                for await event in s.events {
                    guard let self, !Task.isCancelled else { break }
                    var body: [String: Any] = ["sessionId": id]
                    switch event {
                    case .speechStarted(let at): body.merge(["type": "speechStarted", "atMs": at]) { _, b in b }
                    case .speechEnded(let at, let silence): body.merge(["type": "speechEnded", "atMs": at, "silenceMs": silence]) { _, b in b }
                    case .interrupted(let cause): body.merge(["type": "interrupted", "cause": cause.rawValue]) { _, b in b }
                    case .resumed: body["type"] = "resumed"
                    case .backendChanged(let backend, let from): body.merge(["type": "backendChanged", "backend": backend.name, "fromChunk": from]) { _, b in b }
                    case .ended(let reason):
                        body["type"] = "ended"
                        switch reason {
                        case .error(let error): body.merge(["reason": "error", "code": error.code, "message": error.message]) { _, b in b }
                        default: body["reason"] = String(describing: reason)
                        }
                    }
                    self.sendEvent(withName: "QuralingoRecitationEvent", body: body)
                }
            }
            return nil
        }
    }
    @objc(pushAudio:samples:resolver:rejecter:)
    func pushAudio(_ id: String, samples: [NSNumber], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard external, running, !samples.isEmpty, samples.count <= rate,
                  samples.allSatisfy({ $0.doubleValue.isFinite && abs($0.doubleValue) <= 1 }) else { throw failure("Invalid external audio") }
            try requireSession(id).push(samples.map(\.floatValue))
            return nil
        }
    }
    @objc(stop:resolver:rejecter:)
    func stop(_ id: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            let s = try requireSession(id)
            let heads = try await s.finish()
            await chunkTask?.value; running = false
            let d = heads.decoded()
            return lastChunk ?? payload(id, -1, 0, d.tokens.last?.lastMs ?? 0, s.backend.name, d, heads)
        }
    }
    @objc(cancel:resolver:rejecter:)
    func cancel(_ id: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            await (try requireSession(id)).cancel()
            chunkTask?.cancel(); eventTask?.cancel(); session = nil; sessionId = nil; running = false
            return nil
        }
    }
    @objc(showSharingSettings:rejecter:)
    func showSharingSettings(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        command(resolve, reject) { [self] in
            guard let client, let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else { throw failure("No active window or client") }
            var presenter = root
            while let presented = presenter.presentedViewController { presenter = presented }
            presenter.present(SharingSettingsViewController(client), animated: true)
            return nil
        }
    }
    private func number(_ value: Double?) -> Any {
        guard let value, value.isFinite else { return NSNull() }; return value
    }
    private func payload(_ id: String, _ index: Int, _ start: Int, _ end: Int, _ backend: String,
                         _ d: TajweedDecoded, _ heads: TajweedHeads) -> [String: Any] {
        ["sessionId": id, "index": index, "startMs": start, "endMs": end, "backend": backend,
         "decoded": ["text": d.text, "settled": d.settled, "isFinal": d.isFinal,
                     "tokens": d.tokens.map { t in ["id": t.id, "name": t.name, "firstMs": t.firstMs, "peakMs": t.peakMs, "lastMs": t.lastMs, "confidence": number(t.confidence)] as [String: Any] }] as [String: Any],
         "heads": heads.names.compactMap { name -> [String: Any]? in
             guard let h = heads[name] else { return nil }
             return ["name": h.name, "kind": h.kind.rawValue, "frameMs": h.frameMs, "frames": h.frames, "classes": h.classes, "values": h.values.map { number(Double($0)) }]
         }]
    }
    override func invalidate() {
        Task { @MainActor [self] in
            await session?.cancel(); chunkTask?.cancel(); eventTask?.cancel(); await model?.close(); client?.close()
            session = nil; model = nil; client = nil
        }
        super.invalidate()
    }
}

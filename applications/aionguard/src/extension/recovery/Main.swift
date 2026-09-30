import AppKit
import Carbon
import CoreGraphics
import Foundation
import SafariServices

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

private final class RecoveryApplicationDelegate: NSObject, NSApplicationDelegate {
    let startup: () -> Void

    init(startup: @escaping () -> Void) {
        self.startup = startup
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Let AppKit finish launch before starting a modal file-access panel.
        DispatchQueue.main.async(execute: startup)
    }
}

@main enum RecoveryMain {
    static var sequence = ZeroSequence()
    static var tap: CFMachPort?
    static var healthy = true
    static var token = ""
    static var origin = "http://127.0.0.1:4317"
    static var heartbeatInFlight = false
    static var pendingDisarm = false
    static var disarmGeneration = 0
    static var releaseRequestId: String?
    static var nativeRecoveryPending = Bundle.main.bundleIdentifier == "com.aionguard.integration"
    static var sources: [DispatchSourceSignal] = []
    static var observers: [NSObjectProtocol] = []
    static var selectedTokenURL: URL?
    static let session = URLSession(configuration: {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 1
        config.timeoutIntervalForResource = 1
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.connectionProxyDictionary = [:]
        return config
    }(), delegate: NoRedirects(), delegateQueue: nil)

    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        if args == ["--probe-event-tap"] {
            guard CGPreflightListenEventAccess(), !IsSecureEventInputEnabled() else {
                print("Passive event tap unavailable: existing permission or Secure Input gate.")
                exit(2)
            }
            let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
            guard let probe = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                options: .listenOnly, eventsOfInterest: mask,
                callback: { _, _, event, _ in Unmanaged.passUnretained(event) }, userInfo: nil) else {
                print("Passive event tap creation denied by the current app execution boundary.")
                exit(2)
            }
            CGEvent.tapEnable(tap: probe, enable: false)
            CFMachPortInvalidate(probe)
            print("Passive event tap creation succeeded and was immediately closed. No keyboard data was inspected.")
            exit(0)
        }
        if args == ["--preflight"] {
            let allowed = CGPreflightListenEventAccess()
            let secure = IsSecureEventInputEnabled()
            print("Input Monitoring granted: \(allowed ? "yes" : "no")")
            print("Secure Input active: \(secure ? "yes" : "no")")
            print("No permission prompt, event tap, protection lease, or system setting was changed.")
            exit(allowed && !secure ? 0 : 2)
        }
        if Bundle.main.bundleIdentifier == "com.aionguard.integration" {
            let app = NSApplication.shared
            app.setActivationPolicy(.regular)
            let delegate = RecoveryApplicationDelegate {
                if args.isEmpty {
                    SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.aionguard.integration.Extension") { _ in exit(0) }
                } else {
                    startRecovery(args)
                }
            }
            app.delegate = delegate
            withExtendedLifetime(delegate) { app.run() }
            return
        }
        startRecovery(args)
        RunLoop.main.run()
    }
    static func startRecovery(_ args: [String]) {
        guard args.count == 2 || args.count == 4, args[0] == "--token-file" else { usage() }
        if args.count == 4 {
            guard args[2] == "--port", let port = Int(args[3]), (1024...65535).contains(port) else { usage() }
            origin = "http://127.0.0.1:\(port)"
        }
        if Bundle.main.bundleIdentifier == "com.aionguard.integration" && !FileManager.default.isReadableFile(atPath: args[1]) {
            // Keep App Sandbox enabled. Ask macOS's file picker for access only to
            // the exact owner-only file the caller selected; no broad entitlement.
            let app = NSApplication.shared
            let panel = NSOpenPanel()
            panel.title = "Connect AionGuard recovery"
            panel.message = "Select the local recovery-token file. Its contents stay on this Mac."
            panel.prompt = "Connect recovery"
            panel.canChooseDirectories = false
            panel.canChooseFiles = true
            panel.allowsMultipleSelection = false
            panel.directoryURL = URL(fileURLWithPath: args[1]).deletingLastPathComponent()
            app.activate(ignoringOtherApps: true)
            guard panel.runModal() == .OK, let url = panel.url,
                  url.standardizedFileURL.path == URL(fileURLWithPath: args[1]).standardizedFileURL.path else {
                fputs("Recovery token access was not granted. Protection remains unavailable.\n", stderr)
                exit(2)
            }
            _ = url.startAccessingSecurityScopedResource()
            selectedTokenURL = url
        }
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: args[1])
            guard attributes[.type] as? FileAttributeType == .typeRegular,
                  attributes[.ownerAccountID] as? UInt32 == getuid(),
                  let permissions = attributes[.posixPermissions] as? UInt16,
                  permissions & 0o077 == 0 else { throw RecoveryError.invalidTokenFile }
            token = try String(contentsOfFile: args[1], encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
            guard token.range(of: "^[A-Za-z0-9_-]{32,256}$", options: .regularExpression) != nil else { throw RecoveryError.invalidTokenFile }
        } catch {
            fputs("Recovery token file must be an owner-only regular file containing the recovery token.\n", stderr)
            exit(2)
        }
        guard CGPreflightListenEventAccess(), !IsSecureEventInputEnabled() else {
            requestDisarm()
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 1.2))
            fputs("Recovery unavailable: grant this helper Input Monitoring and leave Secure Input before arming. No permission was requested.\n", stderr)
            exit(2)
        }
        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
            eventsOfInterest: mask, callback: { _, type, event, _ in
                if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                    RecoveryMain.healthy = false
                    RecoveryMain.requestDisarm()
                    return Unmanaged.passUnretained(event)
                }
                if type == .keyDown {
                    let flags = event.flags
                    let modified = !flags.intersection([.maskCommand, .maskControl, .maskAlternate]).isEmpty
                    var length = 0
                    var character: UniChar = 0
                    event.keyboardGetUnicodeString(maxStringLength: 1, actualStringLength: &length, unicodeString: &character)
                    let zero = !modified && length == 1 && character == 48
                    let repeated = event.getIntegerValueField(.keyboardEventAutorepeat) != 0
                    if RecoveryMain.sequence.accept(isZero: zero, isRepeat: repeated) { RecoveryMain.requestDisarm() }
                }
                return Unmanaged.passUnretained(event)
            }, userInfo: nil)
        guard let tap, let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
            requestDisarm()
            RunLoop.main.run(until: Date(timeIntervalSinceNow: 1.2))
            fputs("Recovery unavailable: macOS did not create the passive keyboard event tap.\n", stderr)
            exit(2)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.sessionDidResignActiveNotification] {
            observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { _ in
                healthy = false
                requestDisarm()
            })
        }
        for signum in [SIGTERM, SIGINT] {
            signal(signum, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signum, queue: .main)
            source.setEventHandler {
                healthy = false
                requestDisarm()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) {
                    selectedTokenURL?.stopAccessingSecurityScopedResource()
                    exit(0)
                }
            }
            source.resume()
            sources.append(source)
        }
        let timer = Timer(timeInterval: 1, repeats: true) { _ in heartbeat() }
        RunLoop.main.add(timer, forMode: .common)
        heartbeat()
        print("AionGuard recovery listening. Four consecutive zero presses request disarm. Keyboard text is never retained or transmitted.")
    }
    static func heartbeat() {
        let keyboardReady = healthy && CGPreflightListenEventAccess() && !IsSecureEventInputEnabled() && tap.map { CGEvent.tapIsEnabled(tap: $0) } == true
        if !keyboardReady { sequence = ZeroSequence(); requestDisarm() }
        if pendingDisarm { sendPendingDisarm() }
        let ready = keyboardReady && !pendingDisarm && !nativeRecoveryPending
        guard !heartbeatInFlight else { return }
        heartbeatInFlight = true
        let generation = disarmGeneration
        post("/api/protection/heartbeat", object: ["ready": ready]) { ok, state in
            heartbeatInFlight = false
            if !ok { requestDisarm() }
            else if generation == disarmGeneration { observeController(state) }
        }
    }
    static func requestDisarm() {
        sequence = ZeroSequence()
        pendingDisarm = true
        disarmGeneration += 1
        releaseRequestId = UUID().uuidString.lowercased()
        if Bundle.main.bundleIdentifier == "com.aionguard.integration" { nativeRecoveryPending = true }
        // Best effort native release does not depend on the controller being reachable.
        // Re-send after HTTP registration below so the matching acknowledgment can succeed.
        if let requestId = releaseRequestId { dispatchNativeDisarm(requestId) }
        sendPendingDisarm()
    }
    static func sendPendingDisarm() {
        let generation = disarmGeneration
        guard let requestId = releaseRequestId else { return }
        post("/api/protection/disarm", object: ["requestId": requestId]) { ok, _ in
            if ok && generation == disarmGeneration {
                pendingDisarm = false
                dispatchNativeDisarm(requestId)
            }
        }
    }
    static func observeController(_ state: [String: Any]?) {
        guard Bundle.main.bundleIdentifier == "com.aionguard.integration" else { return }
        guard let state, let armed = state["armed"] as? Bool else { nativeRecoveryPending = true; return }
        guard !armed else { return }
        guard let requestId = state["releaseRequestId"] as? String,
              UUID(uuidString: requestId) != nil else { nativeRecoveryPending = true; return }
        let ack = state["lastExtensionAck"] as? [String: Any]
        nativeRecoveryPending = !(ack?["requestId"] as? String == requestId && ack?["rulesRemoved"] as? Bool == true)
        if nativeRecoveryPending { dispatchNativeDisarm(requestId) }
    }
    static func dispatchNativeDisarm(_ requestId: String) {
        guard Bundle.main.bundleIdentifier == "com.aionguard.integration" else { return }
        SFSafariApplication.dispatchMessage(withName: "AIONGUARD_EMERGENCY_DISARM",
            toExtensionWithIdentifier: "com.aionguard.integration.Extension",
            userInfo: ["type": "EMERGENCY_DISARM", "requestId": requestId]) { _ in
                // Delivery completion is not rule-removal proof; require the extension ACK.
            }
    }
    static func post(_ path: String, object: [String: Any], completion: @escaping (Bool, [String: Any]?) -> Void) {
        var request = URLRequest(url: URL(string: origin + path)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: object)
        session.dataTask(with: request) { data, response, error in
            let state = data.flatMap { $0.count <= 4096 ? (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] : nil }
            let success = error == nil && (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { completion(success, state) }
        }.resume()
    }
    static func usage() -> Never {
        fputs("Usage: aionguard-recovery --preflight | --token-file <owner-only-path> [--port 4317]\n", stderr)
        exit(2)
    }
    enum RecoveryError: Error { case invalidTokenFile }
}

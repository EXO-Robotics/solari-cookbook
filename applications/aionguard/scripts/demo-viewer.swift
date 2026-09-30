// Read-only recording companion. Build: swiftc scripts/demo-viewer.swift -o /private/tmp/aionguard-demo-viewer
// --token-file /absolute/controller-token --run-id run_ID --port 4317
import AppKit
import Foundation

private struct Protection: Decodable {
    struct Ack: Decodable { let requestId: String; let rulesRemoved: Bool }
    let armed: Bool
    let releaseRequestId: String?
    let lastExtensionAck: Ack?
    var released: Bool {
        !armed && releaseRequestId != nil && lastExtensionAck?.requestId == releaseRequestId
            && lastExtensionAck?.rulesRemoved == true
    }
}
private struct Snapshot: Decodable {
    struct Identity: Decodable { let runId: String }
    struct Link: Decodable {
        struct Cleanup: Decodable { let state: String }
        let classification: String
        let mode: String
        let source: String
        let imagePath: String?
        let cleanup: Cleanup
    }
    let identity: Identity
    let link: Link
}

// Never follow redirects with the controller credential, even to another local service.
private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

private final class Viewer: NSObject, NSApplicationDelegate {
    private let token: String
    private let runID: String
    private let port: Int
    private let redirects = NoRedirects()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.httpCookieStorage = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 3
        config.timeoutIntervalForResource = 4
        return URLSession(configuration: config, delegate: redirects, delegateQueue: nil)
    }()
    private var timer: Timer?
    private var busy = false
    private var imageShown = false
    private var sawArmed = false
    private var releaseFinished = false
    private var hud: NSPanel!
    private var screenshot: NSWindow?
    private let status = NSTextField(labelWithString: "STATUS UNAVAILABLE")
    private let cleanup = NSTextField(labelWithString: "VM cleanup pending")
    private let teal = NSColor(calibratedRed: 0.30, green: 0.91, blue: 0.79, alpha: 1)
    private let amber = NSColor(calibratedRed: 1, green: 0.72, blue: 0.31, alpha: 1)

    init(token: String, runID: String, port: Int) {
        self.token = token; self.runID = runID; self.port = port
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        hud = NSPanel(contentRect: NSRect(x: screen.maxX - 370, y: screen.maxY - 92,
                                         width: 350, height: 76),
                      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        hud.level = .floating
        hud.isOpaque = false
        hud.backgroundColor = .clear
        hud.hasShadow = true
        hud.ignoresMouseEvents = true
        hud.hidesOnDeactivate = false
        hud.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let body = NSView(frame: NSRect(x: 0, y: 0, width: 350, height: 76))
        body.wantsLayer = true
        body.layer?.backgroundColor = NSColor(calibratedRed: 0.035, green: 0.085, blue: 0.10, alpha: 0.96).cgColor
        body.layer?.cornerRadius = 13
        body.layer?.borderColor = teal.withAlphaComponent(0.35).cgColor
        body.layer?.borderWidth = 1
        status.frame = NSRect(x: 18, y: 37, width: 322, height: 23)
        status.font = .systemFont(ofSize: 17, weight: .bold)
        status.textColor = amber
        let scope = NSTextField(labelWithString: "AionGuard • registered link only")
        scope.frame = NSRect(x: 18, y: 14, width: 318, height: 18)
        scope.font = .systemFont(ofSize: 12, weight: .medium)
        scope.textColor = .lightGray
        body.addSubview(status); body.addSubview(scope)
        hud.contentView = body
        hud.orderFrontRegardless()
        timer = Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { [weak self] _ in self?.poll() }
        // The viewer cannot leave an unattended recording HUD running indefinitely.
        Timer.scheduledTimer(withTimeInterval: 600, repeats: false) { _ in NSApp.terminate(nil) }
        poll()
    }

    private func read(_ path: String, maxBytes: Int, completion: @escaping (Data?) -> Void) {
        guard path == "/api/protection" || path == "/api/attempts/\(runID)"
            || path == "/api/attempts/\(runID)/image",
              let url = URL(string: "http://127.0.0.1:\(port)\(path)") else { completion(nil); return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        session.dataTask(with: request) { data, response, error in
            guard error == nil, let http = response as? HTTPURLResponse, http.statusCode == 200,
                  http.url == url, let data, data.count <= maxBytes else { completion(nil); return }
            if path.hasSuffix("/image") && http.mimeType != "image/png" { completion(nil); return }
            completion(data)
        }.resume()
    }

    private func poll() {
        guard !busy else { return }
        busy = true
        read("/api/attempts/\(runID)", maxBytes: 2_000_000) { [weak self] bytes in
            guard let self else { return }
            guard let bytes, let snapshot = try? JSONDecoder().decode(Snapshot.self, from: bytes),
                  snapshot.identity.runId == self.runID else {
                DispatchQueue.main.async { self.unavailable() }; return
            }
            // Read protection last so case transfer does not extend its displayed age.
            self.read("/api/protection", maxBytes: 32_768) { bytes in
                guard let bytes, let protection = try? JSONDecoder().decode(Protection.self, from: bytes) else {
                    DispatchQueue.main.async { self.unavailable() }; return
                }
                DispatchQueue.main.async { self.apply(protection, snapshot) }
            }
        }
    }

    private func unavailable() {
        busy = false
        status.stringValue = "STATUS UNAVAILABLE"
        status.textColor = amber
        cleanup.stringValue = "Status unavailable • screenshot is a past observation"
    }

    private func apply(_ protection: Protection, _ snapshot: Snapshot) {
        busy = false
        if protection.armed {
            sawArmed = true
            status.stringValue = snapshot.link.classification == "SUSPICIOUS" ? "SUSPICIOUS LINK DETECTED" : "PROTECTION ARMED"
            status.textColor = snapshot.link.classification == "SUSPICIOUS" ? amber : teal
        } else if protection.released {
            status.stringValue = "UNPROTECTED"
            status.textColor = amber
            if sawArmed && imageShown {
                releaseFinished = true
                screenshot?.orderOut(nil)
            }
        } else {
            status.stringValue = "RELEASE PENDING"
            status.textColor = amber
        }
        let cleanupState = snapshot.link.cleanup.state == "CONFIRMED" ? "confirmed"
            : snapshot.link.cleanup.state == "UNRESOLVED" ? "unresolved" : "pending"
        cleanup.stringValue = "VM cleanup \(cleanupState) • captured inspection, not a live browser"
        guard !imageShown, !releaseFinished, protection.armed,
              snapshot.link.mode == "LIVE", snapshot.link.source == "VERCEL_SANDBOX",
              snapshot.link.imagePath == "/api/attempts/\(runID)/image" else { return }
        busy = true
        read("/api/attempts/\(runID)/image", maxBytes: 4_000_000) { [weak self] bytes in
            guard let self else { return }
            guard let bytes, bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) else {
                DispatchQueue.main.async { self.unavailable() }; return
            }
            // Release can occur while image bytes arrive. Recheck before presenting the window.
            self.read("/api/protection", maxBytes: 32_768) { currentBytes in
                guard let currentBytes,
                      let current = try? JSONDecoder().decode(Protection.self, from: currentBytes) else {
                    DispatchQueue.main.async { self.unavailable() }; return
                }
                DispatchQueue.main.async {
                    self.busy = false
                    guard current.armed else { self.apply(current, snapshot); return }
                    guard let image = NSImage(data: bytes) else { self.unavailable(); return }
                    self.show(image)
                }
            }
        }
    }

    private func show(_ image: NSImage) {
        guard !imageShown else { return }
        imageShown = true
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width = min(1290, screen.width - 70)
        let height = min(800, screen.height - 125)
        let window = NSWindow(contentRect: NSRect(x: screen.midX - width / 2, y: screen.midY - height / 2 - 25,
                                                  width: width, height: height),
                              styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "AionGuard — Vercel inspection screenshot"
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(calibratedRed: 0.035, green: 0.065, blue: 0.075, alpha: 1)
        window.appearance = NSAppearance(named: .darkAqua)
        let body = NSView()
        let title = NSTextField(labelWithString: "Vercel inspection screenshot")
        title.font = .systemFont(ofSize: 23, weight: .semibold)
        title.textColor = teal
        cleanup.font = .systemFont(ofSize: 12, weight: .medium)
        cleanup.textColor = .lightGray
        let picture = NSImageView()
        picture.image = image
        picture.imageScaling = .scaleProportionallyUpOrDown
        let release = NSTextField()
        release.placeholderString = "Type 0000 to release"
        release.font = .monospacedSystemFont(ofSize: 17, weight: .medium)
        let explanation = NSTextField(labelWithString: "Keyboard recovery is handled by the existing AionGuard helper.")
        explanation.font = .systemFont(ofSize: 11)
        explanation.textColor = .secondaryLabelColor
        for view in [title, cleanup, picture, release, explanation] {
            view.translatesAutoresizingMaskIntoConstraints = false; body.addSubview(view)
        }
        window.contentView = body
        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: body.leadingAnchor, constant: 24),
            title.topAnchor.constraint(equalTo: body.topAnchor, constant: 18),
            cleanup.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            cleanup.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 7),
            picture.leadingAnchor.constraint(equalTo: body.leadingAnchor, constant: 18),
            picture.trailingAnchor.constraint(equalTo: body.trailingAnchor, constant: -18),
            picture.topAnchor.constraint(equalTo: cleanup.bottomAnchor, constant: 14),
            picture.bottomAnchor.constraint(equalTo: release.topAnchor, constant: -14),
            release.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            release.widthAnchor.constraint(equalToConstant: 240),
            release.heightAnchor.constraint(equalToConstant: 31),
            release.bottomAnchor.constraint(equalTo: body.bottomAnchor, constant: -21),
            explanation.leadingAnchor.constraint(equalTo: release.trailingAnchor, constant: 18),
            explanation.centerYAnchor.constraint(equalTo: release.centerYAnchor),
        ])
        screenshot = window
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(release)
        hud.orderFrontRegardless()
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate(); session.invalidateAndCancel()
    }
}

private func argument(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}

guard let tokenPath = argument("--token-file"), tokenPath.hasPrefix("/"),
      let runID = argument("--run-id"), runID.range(of: "^[a-zA-Z0-9_-]{1,128}$", options: .regularExpression) != nil,
      let port = Int(argument("--port") ?? "4317"), port == 4317,
      let tokenData = try? Data(contentsOf: URL(fileURLWithPath: tokenPath)), tokenData.count <= 4096,
      let rawToken = String(data: tokenData, encoding: .utf8) else {
    fputs("Viewer configuration unavailable. Supply a local token file, fixed run ID, and port 4317.\n", stderr)
    exit(1)
}
let token = rawToken.trimmingCharacters(in: .whitespacesAndNewlines)
guard !token.isEmpty, token.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { exit(1) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
private let delegate = Viewer(token: token, runID: runID, port: port)
app.delegate = delegate
withExtendedLifetime(delegate) { app.run() }

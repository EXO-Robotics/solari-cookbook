// Explicitly invoked integration probe. Never used by the recovery helper itself.
import AppKit
import CoreGraphics

@main enum EventProbe {
    static func main() {
        guard CGPreflightPostEventAccess() else {
            fputs("Synthetic event probe unavailable: macOS Post Event permission is not already granted.\n", stderr)
            exit(2)
        }
        let previous = NSWorkspace.shared.frontmostApplication
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let window = NSWindow(contentRect: NSRect(x: 180, y: 180, width: 460, height: 140),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "AionGuard recovery test · temporary input only"
        window.isReleasedWhenClosed = false
        let input = NSTextField(frame: NSRect(x: 24, y: 45, width: 412, height: 28))
        input.placeholderString = "Synthetic recovery probe. No real protection is armed."
        window.contentView?.addSubview(input)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(input)
        app.activate(ignoringOtherApps: true)
        Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { _ in
            guard app.isActive, app.keyWindow === window,
                  input.currentEditor() === window.firstResponder else {
                fputs("Probe aborted because its temporary input window is not focused. No keys posted.\n", stderr)
                window.close()
                previous?.activate()
                exit(2)
            }
            for _ in 0..<4 {
                for down in [true, false] {
                    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: 29, keyDown: down) else { exit(2) }
                    event.flags = []
                    var character: UniChar = 48
                    event.keyboardSetUnicodeString(stringLength: 1, unicodeString: &character)
                    event.post(tap: .cghidEventTap)
                }
            }
        }
        Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { _ in
            let received = input.stringValue == "0000"
            window.close()
            previous?.activate()
            if received { print("Synthetic zero sequence reached the owned temporary input window.") }
            else { fputs("Probe input delivery could not be confirmed.\n", stderr) }
            exit(received ? 0 : 1)
        }
        app.run()
    }
}

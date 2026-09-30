import SafariServices

/// JavaScript receives containing-app messages through its Safari native port.
/// No inbound native commands or message-body logging are exposed.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}

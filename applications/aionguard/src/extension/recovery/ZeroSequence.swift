/// Stores only the length of the current zero sequence. Never stores keyboard text.
struct ZeroSequence {
    private(set) var count = 0
    mutating func accept(isZero: Bool, isRepeat: Bool = false) -> Bool {
        if isRepeat { return false }
        guard isZero else { count = 0; return false }
        count += 1
        guard count == 4 else { return false }
        count = 0
        return true
    }
}

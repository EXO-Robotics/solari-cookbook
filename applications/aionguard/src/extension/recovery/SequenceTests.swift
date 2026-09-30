@main struct SequenceTests {
    static func main() {
        var sequence = ZeroSequence()
        for _ in 0..<3 { precondition(!sequence.accept(isZero: true)) }
        precondition(sequence.accept(isZero: true))
        precondition(sequence.count == 0)
        precondition(!sequence.accept(isZero: true))
        precondition(!sequence.accept(isZero: false))
        precondition(sequence.count == 0)
        for _ in 0..<3 { precondition(!sequence.accept(isZero: true)) }
        for _ in 0..<20 { precondition(!sequence.accept(isZero: true, isRepeat: true)) }
        precondition(sequence.accept(isZero: true))
        for _ in 0..<2 {
            for _ in 0..<3 { precondition(!sequence.accept(isZero: true)) }
            precondition(sequence.accept(isZero: true))
        }
        print("ZeroSequence tests passed: four real presses, reset, auto-repeat rejection, repeat recovery.")
    }
}

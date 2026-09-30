#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir=${1:-"$script_dir/build"}
mkdir -p "$output_dir"
xcrun swiftc -module-cache-path "$output_dir/module-cache" "$script_dir/ZeroSequence.swift" "$script_dir/SequenceTests.swift" -o "$output_dir/sequence-tests"
"$output_dir/sequence-tests"
xcrun swiftc -module-cache-path "$output_dir/module-cache" "$script_dir/ZeroSequence.swift" "$script_dir/Main.swift" -o "$output_dir/aionguard-recovery" -framework AppKit -framework Carbon -framework SafariServices
printf '%s\n' "Built $output_dir/aionguard-recovery. Listener was not started."

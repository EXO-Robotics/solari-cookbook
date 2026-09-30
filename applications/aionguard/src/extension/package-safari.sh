#!/bin/sh
# Build a local signed Safari containing app. Never installs/enables an extension,
# changes Safari settings, requests certificates, or disables App Sandbox.
set -eu
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  printf '%s\n' 'Usage: src/extension/package-safari.sh <fixture-https-origin> <output-directory> [existing-signing-identity-or--]' >&2
  exit 2
fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
fixture_origin=$1
output_dir=$2
signing_identity=${3:--}
mkdir -p "$output_dir"
output_dir=$(CDPATH= cd -- "$output_dir" && pwd)
if [ -e "$output_dir/safari-app" ]; then
  printf '%s\n' 'Choose a new output directory; this command will not overwrite a generated Xcode project.' >&2
  exit 2
fi
cd "$repository_dir"
node --import tsx "$script_dir/build.ts" "$fixture_origin" "$output_dir/safari-extension"
xcrun safari-web-extension-converter "$output_dir/safari-extension" \
  --project-location "$output_dir/safari-app" --app-name AionGuard \
  --bundle-identifier com.aionguard.integration --swift --macos-only \
  --copy-resources --no-open --no-prompt
python3 - "$script_dir" "$output_dir/safari-app/AionGuard" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1])
project = Path(sys.argv[2])
build_settings = project / 'AionGuard.xcodeproj/project.pbxproj'
text = build_settings.read_text()
# Apple's converter can leave the parent at its template identifier.
text = text.replace('PRODUCT_BUNDLE_IDENTIFIER = com.aionguard.AionGuard;',
                    'PRODUCT_BUNDLE_IDENTIFIER = com.aionguard.integration;')
text = text.replace('SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor;',
                    'SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated;')
# Both containing app and extension retain their generated App Sandbox boundary.
if text.count('ENABLE_APP_SANDBOX = YES;') != 4:
    raise SystemExit('Review changed converter sandbox settings before building.')
if 'PRODUCT_BUNDLE_IDENTIFIER = com.aionguard.integration.Extension;' not in text:
    raise SystemExit('Review changed converter extension bundle identifier before building.')
build_settings.write_text(text)
(project / 'AionGuard/AppDelegate.swift').write_text(
    (source / 'recovery/ZeroSequence.swift').read_text() + '\n' +
    (source / 'recovery/Main.swift').read_text())
(project / 'AionGuard Extension/SafariWebExtensionHandler.swift').write_text(
    (source / 'recovery/SafariWebExtensionHandler.swift').read_text())
PY
xcodebuild -quiet -project "$output_dir/safari-app/AionGuard/AionGuard.xcodeproj" \
  -scheme AionGuard -configuration Debug -destination 'platform=macOS,arch=arm64' \
  -derivedDataPath "$output_dir/safari-build" CODE_SIGN_IDENTITY="$signing_identity" \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= build
codesign --verify --deep --strict "$output_dir/safari-build/Build/Products/Debug/AionGuard.app"
printf '%s\n' "Built $output_dir/safari-build/Build/Products/Debug/AionGuard.app"
printf '%s\n' 'Protection remains disarmed. Safari activation and recovery acknowledgment require separate device verification.'

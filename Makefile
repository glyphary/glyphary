APP_NAME := Glyphary
APP_BUNDLE := src-tauri/target/universal-apple-darwin/release/bundle/macos/$(APP_NAME).app
DMG := src-tauri/target/universal-apple-darwin/release/bundle/dmg/$(APP_NAME)_1.0.0-beta.3_universal.dmg
SIGNING_IDENTITY := $(shell security find-identity -p codesigning -v | grep 'Developer ID Application' | head -n1 | awk -F'"' '{print $$2}')
TAURI_SIGNING_CONFIG := {"bundle":{"macOS":{"signingIdentity":"$(SIGNING_IDENTITY)"}}}

.PHONY: help install dev web docs docs-open manual manual-open build check test audit prod-app release windows run-app open-app open-dmg ship-dmg shipit clean

help:
	@echo "Targets:"
	@echo "  make install       Install npm dependencies and prepare rust targets"
	@echo "  make dev           Run the Tauri desktop app in development mode"
	@echo "  make web           Run the Vite browser preview at http://127.0.0.1:1420"
	@echo "  make docs          Serve the Voilà-style product page at http://127.0.0.1:4174/docs-site/glyphary.html"
	@echo "  make docs-open     Open the Voilà-style product page file directly"
	@echo "  make manual        Serve the user manual at http://127.0.0.1:4174/docs-manual/"
	@echo "  make manual-open   Open the user manual file directly"
	@echo "  make build         Build the frontend"
	@echo "  make check         Typecheck/build frontend and check the Rust shell"
	@echo "  make test          Run frontend and Rust unit tests"
	@echo "  make audit         Run npm audit"
	@echo "  make prod-app      Build the production macOS .app"
	@echo "  make release       Build the production .app and .dmg"
	@echo "  make windows       Try a macOS-hosted Windows NSIS cross-build"
	@echo "  make run-app       Open the built macOS .app"
	@echo "  make open-dmg      Open the built DMG"
	@echo "  make ship-dmg      DMGgn, notarize, staple MacOS version for distribution on github"
	@echo "  make ship-windows  DMGgn, notarize, staple MacOS version for distribution on github"
	@echo "  make shipit        Prepare for release"
	@echo "  make clean         Remove generated frontend and Rust build output"

install:
	npm install
	rustup target add aarch64-apple-darwin x86_64-apple-darwin

dev:
	npm run tauri dev

web:
	npm run dev -- --host 127.0.0.1

docs:
	python3 -m http.server 4174 --bind 127.0.0.1

docs-open:
	open docs-site/glyphary.html

manual:
	python3 -m http.server 4174 --bind 127.0.0.1

manual-open:
	open docs-manual/index.html

build:
	npm run build

check: build
	cd src-tauri && cargo check

test:
	npm run test:frontend
	cd src-tauri && cargo test -- --test-threads=1

audit:
	npm audit

prod-app:
	@test -n "$(SIGNING_IDENTITY)" || (echo "No Developer ID Application identity found"; exit 1)
	npm run tauri build -- --config '$(TAURI_SIGNING_CONFIG)' --bundles app

release:
	@test -n "$(SIGNING_IDENTITY)" || (echo "No Developer ID Application identity found"; exit 1)
	npm run tauri build -- --config '$(TAURI_SIGNING_CONFIG)' --target universal-apple-darwin

ship-windows:
	PATH="/opt/homebrew/opt/llvm/bin:$$PATH" npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis

shipit: ship-dmg ship-windows
	@open src-tauri/target/universal-apple-darwin/release/bundle/dmg
	@open src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis

run-app:
	@test -d "$(APP_BUNDLE)" || (echo "$(APP_BUNDLE) does not exist. Run 'make release' first."; exit 1)
	open "$(APP_BUNDLE)"

open-app: run-app

open-dmg:
	@test -f "$(DMG)" || (echo "$(DMG) does not exist. Run 'make release' first."; exit 1)
	open "$(DMG)"

ship-dmg: release
	@set -e; \
	DMG="$$(ls -t src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -n1)"; \
	xcrun notarytool submit "$$DMG" --keychain-profile "notary-profile" --wait; \
	xcrun stapler staple "$$DMG"; \
	xcrun stapler validate "$$DMG"; \
	spctl -a -t open --context context:primary-signature -v "$$DMG"; \
	echo "Final path: $$DMG";

clean:
	rm -rf dist src-tauri/target

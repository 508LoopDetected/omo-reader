#!/bin/sh
# omo-reader installer
# Usage: curl -fsSL https://raw.githubusercontent.com/508LoopDetected/omo-reader/main/install.sh | bash
#
# Linux: downloads the AppImage from the latest GitHub release, installs it to
# ~/.local/bin/omogui, and creates a .desktop entry.
#
# macOS / Windows: prints the releases page URL. Those platforms ship as a
# .dmg / .exe installer — download and double-click; no curl|bash flow.

set -e

REPO="508LoopDetected/omo-reader"
APP_NAME="omo-reader"
BIN_DIR="${HOME}/.local/bin"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$APP_NAME"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

info()  { printf '  \033[1;34m>\033[0m %s\n' "$1"; }
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
err()   { printf '  \033[1;31m✗\033[0m %s\n' "$1" >&2; }
die()   { err "$1"; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

detect_platform() {
	OS="$(uname -s)"
	ARCH="$(uname -m)"

	case "$OS" in
		Linux*)  PLATFORM="linux" ;;
		Darwin*) PLATFORM="mac" ;;
		*)
			die "Unsupported OS: $OS. Download an installer from https://github.com/$REPO/releases"
			;;
	esac

	case "$ARCH" in
		x86_64|amd64)   ARCH="x64" ;;
		aarch64|arm64)  ARCH="arm64" ;;
		*) die "Unsupported architecture: $ARCH" ;;
	esac

	info "Detected: $PLATFORM $ARCH"
}

resolve_version() {
	if command_exists curl; then
		FETCH="curl -fsSL"
	elif command_exists wget; then
		FETCH="wget -qO-"
	else
		die "curl or wget required"
	fi

	info "Checking latest release..."
	VERSION="$($FETCH "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')"

	[ -n "$VERSION" ] || die "Could not determine latest version. Check https://github.com/$REPO/releases"

	# Strip the leading "v" for matching the version embedded in artifact names.
	VERSION_BARE="${VERSION#v}"
	info "Latest version: $VERSION"
	BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
}

download() {
	url="$1"
	dest="$2"
	info "Downloading $(basename "$dest")..."
	if command_exists curl; then
		curl -fsSL -o "$dest" "$url"
	else
		wget -qO "$dest" "$url"
	fi
}

install_linux() {
	# Artifact name shape (see packages/gui/package.json#build.artifactName):
	#   omogui-<version>-linux-<arch>.AppImage
	APPIMAGE="omogui-${VERSION_BARE}-linux-${ARCH}.AppImage"
	TMPDIR="$(mktemp -d)"
	trap 'rm -rf "$TMPDIR"' EXIT

	download "$BASE_URL/$APPIMAGE" "$TMPDIR/omogui"
	chmod +x "$TMPDIR/omogui"

	mkdir -p "$BIN_DIR"
	mv "$TMPDIR/omogui" "$BIN_DIR/omogui"
	ok "Installed omogui to $BIN_DIR/omogui"

	mkdir -p "$DESKTOP_DIR" "$DATA_DIR"
	cat > "$DESKTOP_DIR/omo-reader.desktop" << DESKTOP
[Desktop Entry]
Type=Application
Name=omo reader
Comment=Comic and manga reader
Exec=$BIN_DIR/omogui
Icon=$DATA_DIR/icon.png
Categories=Graphics;Viewer;
Terminal=false
DESKTOP
	ok "Created desktop entry at $DESKTOP_DIR/omo-reader.desktop"

	case ":$PATH:" in
		*":$BIN_DIR:"*) ;;
		*) printf '\n  \033[1;33m!\033[0m Add %s to your PATH:\n    export PATH="%s:$PATH"\n\n' "$BIN_DIR" "$BIN_DIR" ;;
	esac
}

main() {
	printf '\n  \033[1momo-reader installer\033[0m\n\n'
	detect_platform

	if [ "$PLATFORM" = "mac" ]; then
		printf '  macOS ships as a .dmg installer (no curl|bash install flow).\n'
		printf '  Download:  https://github.com/%s/releases/latest\n\n' "$REPO"
		exit 0
	fi

	resolve_version
	install_linux

	printf '\n  \033[1;32mDone!\033[0m  Run: omogui  (or find "omo reader" in your application menu)\n\n'
}

main

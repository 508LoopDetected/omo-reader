#!/bin/sh
# omo-reader installer
# Usage: curl -fsSL https://raw.githubusercontent.com/<owner>/omo-reader/main/install.sh | bash
#
# Installs omotui (TUI) and/or omogui (GUI desktop app).

set -e

REPO="508LoopDetected/omo-reader"
APP_NAME="omo-reader"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$APP_NAME"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

# ── Helpers ──

info()  { printf '  \033[1;34m>\033[0m %s\n' "$1"; }
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
err()   { printf '  \033[1;31m✗\033[0m %s\n' "$1" >&2; }
die()   { err "$1"; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ── Detect platform ──

detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux*)  PLATFORM="linux" ;;
        Darwin*) PLATFORM="macos" ;;
        *) die "Unsupported OS: $OS. For Windows, download the installer from GitHub Releases." ;;
    esac

    case "$ARCH" in
        x86_64|amd64) ARCH="x86_64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) die "Unsupported architecture: $ARCH" ;;
    esac

    info "Detected: $PLATFORM $ARCH"
}

# ── Resolve latest version ──

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

    if [ -z "$VERSION" ]; then
        die "Could not determine latest version. Check https://github.com/$REPO/releases"
    fi

    info "Latest version: $VERSION"
    BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
}

# ── Download helper ──

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

# ── Install TUI ──

install_tui() {
    BINARY_NAME="omotui-${PLATFORM}-${ARCH}"
    TMPDIR="$(mktemp -d)"
    trap 'rm -rf "$TMPDIR"' EXIT

    # Download binary
    download "$BASE_URL/$BINARY_NAME" "$TMPDIR/omotui"
    chmod +x "$TMPDIR/omotui"

    # Download reader SPA
    download "$BASE_URL/reader-spa.tar.gz" "$TMPDIR/reader-spa.tar.gz"

    # Install binary
    mkdir -p "$BIN_DIR"
    mv "$TMPDIR/omotui" "$BIN_DIR/omotui"
    ok "Installed omotui to $BIN_DIR/omotui"

    # Install reader SPA
    mkdir -p "$DATA_DIR/reader"
    tar xzf "$TMPDIR/reader-spa.tar.gz" -C "$DATA_DIR/reader" --strip-components=1 2>/dev/null || \
    tar xzf "$TMPDIR/reader-spa.tar.gz" -C "$DATA_DIR/reader"
    ok "Installed reader SPA to $DATA_DIR/reader"

    # Check PATH
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *) printf '\n  \033[1;33m!\033[0m Add %s to your PATH:\n    export PATH="%s:$PATH"\n\n' "$BIN_DIR" "$BIN_DIR" ;;
    esac
}

# ── Install GUI ──

install_gui() {
    BINARY_NAME="omogui-${PLATFORM}-${ARCH}"
    TMPDIR="$(mktemp -d)"
    trap 'rm -rf "$TMPDIR"' EXIT

    # Download binary
    download "$BASE_URL/$BINARY_NAME" "$TMPDIR/omogui"
    chmod +x "$TMPDIR/omogui"

    # Download GUI SPA
    download "$BASE_URL/gui-spa.tar.gz" "$TMPDIR/gui-spa.tar.gz"

    # Install binary
    mkdir -p "$BIN_DIR"
    mv "$TMPDIR/omogui" "$BIN_DIR/omogui"
    ok "Installed omogui to $BIN_DIR/omogui"

    # Install GUI SPA
    mkdir -p "$DATA_DIR/gui"
    tar xzf "$TMPDIR/gui-spa.tar.gz" -C "$DATA_DIR/gui" --strip-components=1 2>/dev/null || \
    tar xzf "$TMPDIR/gui-spa.tar.gz" -C "$DATA_DIR/gui"
    ok "Installed GUI SPA to $DATA_DIR/gui"

    # Create .desktop entry (Linux only)
    if [ "$PLATFORM" = "linux" ]; then
        mkdir -p "$DESKTOP_DIR"
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

        # Try to download icon for desktop entry
        download "$BASE_URL/icon-256.png" "$DATA_DIR/icon.png" 2>/dev/null || true
    fi

    # Check PATH
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *) printf '\n  \033[1;33m!\033[0m Add %s to your PATH:\n    export PATH="%s:$PATH"\n\n' "$BIN_DIR" "$BIN_DIR" ;;
    esac
}

# ── Main ──

main() {
    printf '\n  \033[1momo-reader installer\033[0m\n\n'

    detect_platform
    resolve_version

    printf '\n  What would you like to install?\n'
    printf '    1) TUI only (omotui — terminal interface)\n'
    printf '    2) GUI only (omogui — desktop app)\n'
    printf '    3) Both\n'
    printf '\n  Choice [1-3]: '
    read -r choice

    case "$choice" in
        1) install_tui ;;
        2) install_gui ;;
        3) install_tui; install_gui ;;
        *) die "Invalid choice: $choice" ;;
    esac

    printf '\n  \033[1;32mDone!\033[0m\n\n'

    case "$choice" in
        1|3) info "Run: omotui" ;;
    esac
    case "$choice" in
        2|3)
            if [ "$PLATFORM" = "linux" ]; then
                info "Run: omogui (or find 'omo reader' in your application menu)"
            fi
            ;;
    esac
    printf '\n'
}

main

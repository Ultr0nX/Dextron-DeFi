#!/usr/bin/env bash
# Re-extract ABIs from the latest forge build into the React app.
# Run this from the contracts/ directory after `forge build`.
set -euo pipefail

OUT_DIR="$(dirname "$0")/out"
ABIS_DIR="$(dirname "$0")/../src/abis"

mkdir -p "$ABIS_DIR"

extract() {
    local artifact="$1"
    local name="$2"
    local key="$3"
    jq "{ $key: .abi }" "$artifact" > "$ABIS_DIR/$name.json"
    echo "wrote $ABIS_DIR/$name.json"
}

extract "$OUT_DIR/SwapX.sol/SwapX.json"  SwapX  SWAPX_ABI
extract "$OUT_DIR/Token.sol/Token.json"  Token  TOKEN_ABI

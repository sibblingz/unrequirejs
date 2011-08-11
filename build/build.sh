#!/bin/bash

DIR="$( cd "$( dirname "$0" )" && pwd )"
ROOT="$DIR/.."
OUT="$ROOT/unrequire.min.js"

function minify_closure_compiler {
    # Minify with Google Closure Compiler
    type java > /dev/null 2>&1 &&
        java -jar "$DIR/google-closure-compiler-1180.jar" --compilation_level SIMPLE_OPTIMIZATIONS ||
        (echo 'WARNING: Java not installed; skipping Google Closure Compiler minification' >&2; cat)
}

function minify_uglifyjs {
    # Minify with UglifyJS
    type uglifyjs > /dev/null 2>&1 &&
        uglifyjs ||
        (echo 'WARNING: UglifyJS not installed; skipping UglifyJS minification' >&2; cat)
}

(
    # Build main JS file
    echo ';// I am awesome'
    echo "(function () {"
    cat "$ROOT/lib/unrequire.js"
    echo "}());"
) | (
    minify_closure_compiler | minify_uglifyjs
) | (
    # Add license information
    # TODO Have licenses loaded properly using @preserve
    cat <<'EOF'
/*
unrequire.js

Copyright 2011 Sibblingz, Inc.

Licensed under MIT
*/
EOF
    cat
) > "$OUT"

echo "Build done; see $OUT"

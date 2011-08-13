#!/bin/bash

DIR="$( cd "$( dirname "$0" )" && pwd )"
ROOT="$DIR/.."
OUT="$ROOT/unrequire.min.js"

function minify_closure_compiler {
    # Minify with Google Closure Compiler
    type java > /dev/null 2>&1 &&
        java -jar "$DIR/google-closure-compiler-1180.jar" --compilation_level ADVANCED_OPTIMIZATIONS ||
        (echo 'WARNING: Java not installed; skipping Google Closure Compiler minification' >&2; cat)
}

function minify_uglifyjs {
    # Minify with UglifyJS
    type uglifyjs > /dev/null 2>&1 &&
        uglifyjs ||
        (echo 'WARNING: UglifyJS not installed; skipping UglifyJS minification' >&2; cat)
}

function strip_debug {
    awk -f "$DIR/strip-comments.awk" "$@"
}

OPT_COMMONJS_COMPAT=true
OPT_ENABLE_ALIASES=true
OPT_ENABLE_BROWSER=true
OPT_ENABLE_NODEJS=true

(
    # Build main JS file
    echo ';// I am awesome'
    echo '(function () {'

    echo "/**@const*/ var COMMONJS_COMPAT = $OPT_COMMONJS_COMPAT;"
    echo "/**@const*/ var ENABLE_ALIASES = $OPT_ENABLE_ALIASES;"
    echo "/**@const*/ var ENABLE_BROWSER = $OPT_ENABLE_BROWSER;"
    echo "/**@const*/ var ENABLE_NODEJS = $OPT_ENABLE_NODEJS;"

    strip_debug "$ROOT/lib/unrequire.js"
    echo '}());'
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

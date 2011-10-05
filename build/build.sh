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

function strip_debug {
    awk -f "$DIR/strip-comments.awk" "$@"
}

function print_usage {
    cat >&2 <<EOF
Usage: $0 [options]
options:
  --help             Print this help
  --browser          Build only with browser support
  --nodejs           Build only with Node.JS support
  --spaceport        Build only with Spaceport support
  --enable-commonjs  Build only with CommonJS compatibility
  --enable-aliases   Build only with alias support
  --output file      Specify the output file
                     [default: $OUT]
EOF
}

OPT_ENABLE_COMMONJS=false
OPT_ENABLE_ALIASES=false
OPT_BROWSER=false
OPT_NODEJS=false
OPT_SPACEPORT=false

OPT_ANY=false
OPT_OUT_GIVEN=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help) print_usage ; exit 0 ;;

        --browser)   OPT_ANY=true ; OPT_BROWSER=true ;;
        --nodejs)    OPT_ANY=true ; OPT_NODEJS=true ;;
        --spaceport) OPT_ANY=true ; OPT_SPACEPORT=true ;;

        --enable-commonjs) OPT_ANY=true ; OPT_ENABLE_COMMONJS=true ;;
        --enable-aliases)  OPT_ANY=true ; OPT_ENABLE_ALIASES=true ;;

        --output) OPT_OUT_GIVEN=true ; OUT="$2" ; shift ;;

        ?) print_usage "$0" ; exit 1 ;;
    esac
    shift
done

if ! $OPT_ANY; then
    OPT_ENABLE_COMMONJS=true
    OPT_ENABLE_ALIASES=true
    OPT_BROWSER=true
    OPT_NODEJS=true
    OPT_SPACEPORT=true
fi

(
    # Build main JS file
    echo ';// I am awesome'
    echo '(function () {'

    echo "/**@const*/ var COMMONJS_COMPAT = $OPT_ENABLE_COMMONJS;"
    echo "/**@const*/ var ENABLE_ALIASES = $OPT_ENABLE_ALIASES;"
    echo "/**@const*/ var ENABLE_BROWSER = $OPT_BROWSER;"
    echo "/**@const*/ var ENABLE_NODEJS = $OPT_NODEJS;"
    echo "/**@const*/ var ENABLE_SPACEPORT = $OPT_SPACEPORT;"
    echo "/**@const*/ var BROWSER_SYNC = false;"
    echo "/**@const*/ var ENABLE_PACKAGES = true;"
    echo "/**@const*/ var LOGGING = false;"
    echo "/**@const*/ var WARNINGS = false;"
    echo "/**@const*/ var CHECK_CYCLES = false;"

    strip_debug "$ROOT/lib/unrequire.js"
    echo '}());'
) | (
    minify_closure_compiler | minify_uglifyjs
) > "$OUT"

$OPT_OUT_GIVEN || echo "Build done; see $OUT"

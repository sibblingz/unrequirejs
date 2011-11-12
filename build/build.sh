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
        uglifyjs --no-seqs ||
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
  --output file      Specify the output file
                     [default: $OUT]
EOF
}

OPT_OUT_GIVEN=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help) print_usage ; exit 0 ;;
        --output) OPT_OUT_GIVEN=true ; OUT="$2" ; shift ;;

        ?) print_usage "$0" ; exit 1 ;;
    esac
    shift
done

(
    echo ';// I am awesome'
    echo '(function (window) {'

    # Flags
    echo "/**@const*/ var ENABLE_PACKAGES = true;"
    echo "/**@const*/ var LOGGING = false;"

    # Main code
    echo "var unrequire = "
    strip_debug "$ROOT/lib/unrequire.js"

    # Plugins
    cat "$ROOT/lib/browser.js"

    echo '}(window));'
) | (
    minify_closure_compiler
) | (
    # For whatever reason, Closure decides it's okay to pollute the global
    # namespace with a `null` variable.  Better safe than sorry!
    echo ';// I am awesome'
    echo '(function () {'
    cat
    echo '}());'
) | (
    minify_uglifyjs
) > "$OUT"

uglifyjs -b -ns -nm < "$OUT" > "$OUT.unmin.js"

$OPT_OUT_GIVEN || echo "Build done; see $OUT"

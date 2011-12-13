#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$DIR/.."
OUT="$ROOT/unrequire.min.js"

function minify_closure_compiler {
    # Minify with Google Closure Compiler
    if type java > /dev/null 2>&1; then
        java -jar "$DIR/google-closure-compiler-1180.jar" --compilation_level ADVANCED_OPTIMIZATIONS
    else
        echo 'WARNING: Java not installed; skipping Google Closure Compiler minification' >&2
        cat
    fi
}

function minify_uglifyjs {
    # Minify with UglifyJS
    if type uglifyjs > /dev/null 2>&1; then
        uglifyjs --no-seqs
    else
        echo 'WARNING: UglifyJS not installed; skipping UglifyJS minification' >&2
        cat
    fi
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
  --compress         Compress output
                     [default]
  --no-compress      Do not compress output
  --browser          Include web browser plugin
                     [$PLUGIN_BROWSER]
                     [default]
  --node             Include Node.js plugin
                     [$PLUGIN_NODE]
  --plugin file.js   Include specified plugin file
EOF
}

OPT_COMPRESS=true
OPT_OUT_GIVEN=false
OPT_PLUGIN_GIVEN=false

PLUGINS=

PLUGIN_BROWSER="$ROOT/lib/browser.js"
PLUGIN_NODE="$ROOT/lib/node.js"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help) print_usage ; exit 0 ;;
        --output) OPT_OUT_GIVEN=true ; OUT="$2" ; shift ;;
        --compress) OPT_COMPRESS=true ;;
        --no-compress) OPT_COMPRESS=false ;;

        --browser) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$PLUGIN_BROWSER" ;;
        --node) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$PLUGIN_NODE" ;;
        --plugin) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$2" ; shift ;;

        ?) print_usage "$0" ; exit 1 ;;
    esac
    shift
done

if ! $OPT_PLUGIN_GIVEN; then
    PLUGINS="$PLUGIN_NODE:$PLUGIN_BROWSER"
fi

(
    echo ';// I am awesome'
    echo '(function (window) {'

    # Flags
    echo "/**@const*/ var ENABLE_PACKAGES = true;"
    echo "/**@const*/ var LOGGING = false;"

    # Main code
    echo "var unrequire = "
    strip_debug "$ROOT/lib/unrequire.js"

    # Plugins (colon-separated)
    for plugin_file in $(echo "$PLUGINS" | tr ':' '\n'); do
        echo "Installing plugin $plugin_file" >&2
        cat "$plugin_file"
    done

    echo '}(window));'
) | (
    if $OPT_COMPRESS; then minify_closure_compiler; else cat; fi
) | (
    # For whatever reason, Closure decides it's okay to pollute the global
    # namespace with a `null` variable.  Better safe than sorry!
    echo ';// I am awesome'
    echo '(function () {'
    cat
    echo '}());'
) | (
    if $OPT_COMPRESS; then minify_uglifyjs; else cat; fi
) > "$OUT"

$OPT_OUT_GIVEN || echo "Build done; see $OUT"

#!/bin/bash

set -e -E -o pipefail

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

function after_script {
    echo '//*/';
    echo ';'
}

function print_usage {
    cat >&2 <<EOF
Usage: $0 [options] [plugins]
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
  --spaceport        Include Spaceport plugin
                     [$PLUGIN_SPACEPORT]
EOF
}

function unknown_option {
    echo "Unknown option: $1" >&2
    print_usage "$2"
}

OPT_COMPRESS=true
OPT_OUT_GIVEN=false
OPT_PLUGIN_GIVEN=false

PLUGINS=

PLUGIN_BROWSER="$ROOT/lib/browser.js"
PLUGIN_NODE="$ROOT/lib/node.js"
PLUGIN_SPACEPORT="$ROOT/lib/spaceport.js"

#--plugin) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$2" ; shift ;;

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h) print_usage ; exit 0 ;;
        --help) print_usage ; exit 0 ;;
        --output) OPT_OUT_GIVEN=true ; OUT="$2" ; shift ;;
        --compress) OPT_COMPRESS=true ;;
        --no-compress) OPT_COMPRESS=false ;;

        --browser) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$PLUGIN_BROWSER" ;;
        --node) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$PLUGIN_NODE" ;;
        --spaceport) OPT_PLUGIN_GIVEN=true ; PLUGINS="$PLUGINS:$PLUGIN_SPACEPORT" ;;

        --)
            OPT_PLUGIN_GIVEN=true
            while [ "$#" -gt 1 ]; do
                shift
                PLUGINS="$PLUGINS:$1"
            done
            ;;

        -?) unknown_option "$1" "$0" ; exit 1 ;;
        --*) unknown_option "$1" "$0" ; exit 1 ;;

        *) OPT_PLUGIN_GIVEN=true PLUGINS="$PLUGINS:$1" ;;
    esac
    shift
done

if ! $OPT_PLUGIN_GIVEN; then
    PLUGINS="$PLUGIN_NODE:$PLUGIN_BROWSER"
fi

(
    # Flags
    echo "/**@const*/ var LOGGING = false;"

    # Main code
    echo "var unrequire = "
    strip_debug "$ROOT/lib/unrequire.js"
    after_script

    # Plugins (colon-separated)
    for plugin_file in $(echo "$PLUGINS" | tr ':' '\n'); do
        echo "Installing plugin $plugin_file" >&2
        strip_debug "$plugin_file"
        after_script
    done

    after_script
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

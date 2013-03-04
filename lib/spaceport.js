// This plugin is similar to the Node.js plugin (see
// lib/node.js) and the Browser plugin (see lib/browser.js).
// Instead of fs.readFile, there is a global loadScript
// function (which doesn't give us errors).

(function () {

if (typeof loadScript !== 'function') {
    return;
}

unrequire['definePlugin']("spaceport", function (un) {
    var parseUri = un['parseUri'];
    var buildUri = un['buildUri'];

    function throwingCallback(err) {
        if (err) {
            throw err;
        }
    }

    // defineQueue :: [DefineArguments]
    var defineQueue = [ ];

    function canSkipDefineQueue() {
        // HACK to get global defines to work
        return defineUses === 1;
    }

    function flushDefineQueue(requestName, config) {
        var args;
        while ((args = defineQueue.shift())) {
            if (args.name === null) {
                args.name = requestName;
            }

            un['handleDefine'](args, config, throwingCallback);
        }
    }

    function define() {
        var args = un['parseDefineArguments'](arguments);

        if (canSkipDefineQueue() && args.name) {
            // HACK
            un['handleDefine'](args, '(global)', throwingCallback);
            return;
        }

        defineQueue.push(args);
    }

    var oldDefine;
    var defineUses = 0;

    var globalConfiguration = un['createDefaultConfiguration']();

    function globalRequire() {
        var args = un['parseRequireArguments'](arguments);
        un['handleRequire'](args, globalConfiguration, throwingCallback);
    }

    var globalObject = (function () { return this; }());
    // TODO Rename to unrequire and have unrequire.load
    globalObject['require'] = globalRequire;

    // TODO I don't like this but modules seem to depend upon
    // it being present without a require
    globalObject['define'] = define;
    ++defineUses;

    return {
        // getResourceID :: ModuleName -> Maybe ResourceID
        'getResourceID': function getResourceID(moduleName) {
            var uri = parseUri(moduleName);
            var extensions = uri['file'].split('.').slice(1);
            var p = uri['path'];
            if (!extensions.length) {
                // No extension implies .js.
                p += '.js';
            } else if (extensions[extensions.length - 1] !== 'js') {
                // Not a .js file.
                return null;
            }

            return buildUri(
                uri['protocol'],
                uri['authority'],
                p,
                uri.query
                /* no anchor */
            );
        },

        // fetchResource
        //   :: ResourceID
        //   -> Configuration
        //   -> Callback ()
        //   -> IO ()
        'fetchResource': function fetchResource(scriptName, config, callback) {
            // Change directory of sub-config, so relative paths are based on
            // the module's path.
            var scriptUri = parseUri(scriptName);
            var newCwd = buildUri(
                scriptUri['protocol'],
                scriptUri['authority'],
                scriptUri['directory']
                /* no query, no anchor */
            ).replace(/\/+$/, '');  // .replace is a HACK
            config = un['joinConfigurations'](config, { }); // HACK to clone config
            config['cwd'] = newCwd;

            // Make 'define' function global.
            if (defineUses === 0) {
                oldDefine = globalObject['define'];
            }
            globalObject['define'] = define;
            ++defineUses;

            loadScript(scriptName, function (/* no error =[ */) {
                --defineUses;
                if (defineUses < 0) {
                    throw new Error("Bad defineUses state; please report to unrequire developers!");
                }
                if (defineUses === 0) {
                    globalObject['define'] = oldDefine;
                }

                flushDefineQueue(scriptName, config);
                callback(null);
            });
        },

        // extractModule :: Object -> ModuleName -> Callback Object -> IO ()
        'extractModule': function extractModule(object, moduleName, callback) {
            callback(null, object);
        }
    };
});

}());

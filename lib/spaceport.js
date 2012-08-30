// This plugin is similar to the browser plugin (see browser.js).
// Basically, there is instead a global loadScript function.

(function () {

if (typeof loadScript !== 'function') {
    return;
}

unrequire['definePlugin'](function (un) {
    function throwingCallback(err) {
        if (err) {
            throw err;
        }
    }

    // Queueing behaviour is like in the browser plugin, except we only have
    // the global queue (non-interactivescript behaviour).  See browser.js for
    // details.

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

    // TODO Rename to unrequire and have unrequire.load
    window['require'] = globalRequire;

    // TODO I don't like this but modules seem to depend upon
    // it being present without a require
    window['define'] = define;
    ++defineUses;

    return {
        // normalize :: RawName -> ModuleName
        'normalize': function normalize(rawName) {
            var filename = rawName.split('/').slice(-1)[0];
            if (!/\.js$/i.test(filename)) {
                rawName += '.js';
            }

            // TODO Path normalization
            return rawName;
        },

        // resolve :: ModuleName -> Maybe RequestName
        'resolve': function resolve(moduleName) {
            var filename = moduleName.split('/').slice(-1)[0];
            if (!/(\.js)?$/i.test(filename)) {
                // Not a .js file; don't handle
                return null;
            }

            return moduleName;
        },

        // request :: RequestName -> Configuration -> IO (Maybe Error,IO [Announce])
        'request': function request(requestName, config, callback) {
            var newCwd = requestName.replace(/\/[^\/]+$/, '');
            config = un['joinConfigurations'](config, { }); // HACK to clone config
            config['cwd'] = newCwd;

            if (defineUses === 0) {
                oldDefine = window['define'];
            }
            window['define'] = define;
            ++defineUses;

            loadScript(requestName, function (err) {
                --defineUses;
                if (defineUses < 0) {
                    throw new Error("Bad defineUses state; please report to unrequire developers!");
                }
                if (defineUses === 0) {
                    window['define'] = oldDefine;
                }

                if (err) return callback(err);

                flushDefineQueue(requestName, config);

                callback(null);
            });
        }
    };
});

}());

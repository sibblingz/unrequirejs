unrequire.definePlugin(function (un) {
    var goodResponseCodes = [ 200, 204, 206, 301, 302, 303, 304, 307 ];
    var doc = window.document;

    var onreadystatechange = 'onreadystatechange';
    var onload = 'onload';
    var onerror = 'onerror';

    // We queue defines because sometimes we don't know what
    // define is associated with what script until *after* the
    // script completes execution.  (We flush the queue when we
    // know we have this information.)
    //
    // Note that we either are guaranteed to know what script
    // we are running in (IE), or we are guaranteed that
    // nothing happens between a script ending completion and
    // the browser telling us a script completed (Webkit,
    // Firefox, Opera.
    //
    // Note that this may change in the future when we start
    // complicating things with crap like configurations and
    // contexts.
    //
    // defineQueue :: [DefineArguments]
    var defineQueue = [ ];

    function handleDefine(args, config) {
        var moduleName = un.normalizeRawName(args.name, config);
        un.announce(moduleName, function () {
            un.execute(args.deps, config, args.callback, function (errs, value) {
                if (errs) throw errs;

                un.push(moduleName, value);
            });
        });
    }

    function flushDefineQueue(requestName, config) {
        var args;
        while ((args = defineQueue.shift())) {
            if (args.name === null) {
                args.name = requestName;
            }

            handleDefine(args, config);
        }
    }

    function loadScript(scriptName, callback) {
        var script = doc.createElement('script');
        script.async = true;

        // Modelled after jQuery (src/ajax/script.js)
        script[onload] = script[onreadystatechange] = function () {
            if (!script.readyState || /loaded|complete/.test(script.readyState)) {
                // Remove from DOM
                var parent = script.parentNode;
                if (parent) {
                    parent.removeChild(script);
                }

                // IE likes memleaks
                script[onload] = script[onreadystatechange] = script[onerror] = null;
                script = null;

                callback(null);
            }
        };

        script[onerror] = function () {
            callback(new Error('Failed to load script'));
        };

        // Remember: we need to attach event handlers before
        // assigning `src`.  Events may be fired as soon as we set
        // `src`.
        script.src = scriptName;

        doc['head'].appendChild(script);
    }

    function define() {
        var args = un.parseDefineArguments(arguments);
        // TODO Handle IE (interactivescript jazz
        defineQueue.push(args);
    }

    var globalConfiguration = un.createDefaultConfiguration();

    function globalRequire() {
        var args = un.parseRequireArguments(arguments);
        un.execute(args.deps, globalConfiguration, args.callback, function (errs, value) {
            if (errs) throw errs;
        });
    }

    window.require = globalRequire;

    return {
        // normalize :: RawName -> ModuleName
        normalize: function normalize(rawName) {
            var filename = rawName.split('/').slice(-1)[0];
            if (!/\.js$/i.test(filename)) {
                rawName += '.js';
            }

            // Awesomely cheap way to normalize a path.  =]
            var anchor = document.createElement('a');
            anchor.href = rawName;
            return anchor.href;
        },

        // resolve :: ModuleName -> Maybe RequestName
        resolve: function resolve(moduleName) {
            var filename = moduleName.split('/').slice(-1)[0];
            if (!/(\.js)?$/i.test(filename)) {
                // Not a .js file; don't handle
                return null;
            }

            return moduleName;
        },

        // request :: RequestName -> Configuration -> IO (Maybe Error,IO [Announce])
        request: function request(requestName, config, callback) {
            var newCwd = requestName.replace(/\/[^\/]+$/, '');
            config = un.joinConfigurations(config, { }); // HACK to clone config
            config.cwd = newCwd;

            var oldDefine = window.define;
            window.define = define;
            loadScript(requestName, function (err) {
                window.define = oldDefine;

                if (err) return callback(err);

                flushDefineQueue(requestName, config);
            });
        }
    };
});

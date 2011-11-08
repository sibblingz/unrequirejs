(function () {
    // Path of execution for browser:
    //
    // > unrequire([ 'foo' ]);
    //
    // The rawName is normalized based upon the configuration, to
    // become the moduleName, e.g. './foo'.
    //
    // browser.onResolve is called with './foo' as the moduleName.
    // browser.onResolve responds with './foo.js' as the resourceName.
    //
    // The announce and request hashes are inspected.  An announce or request
    // of resourceName './foo.js' hasn't been made yet, so we must request
    // that resource.
    //
    // un.pull is called with './foo.js' as the resourceName.
    // browser.onRequest is called with './foo.js' as the resourceName.
    //
    // browser creates a global function `define` then requests the script
    // './foo.js'.  When `define` is called, un.announce is called with
    // './foo.js' as the resourceName*.
    //
    // When the script completes execution, browser cals the onRequest
    // callback, indicating that no error has occured.
    //
    // Hearing back from onRequest, we check the announce hash ...
    //
    // *This is easy in IE; hard in other browsers.  Assume we determine
    // this by knowing in what script we are running.

    // Note: The Haskell type annotations are (obviously) not 100% accurate
    // (and may hide some things), but it helps in understanding the flow of
    // e.g. module identifier types.

    var slice = Array.prototype.slice;
    var hasOwnProperty = Object.prototype.hasOwnProperty;

    function hasOwn(object, property) {
        return hasOwnProperty.call(object, property);
    }

    function map(array, fn) {
        return array.map(fn);
    }

    function callbackMany(functions, doneCallback) {
        // If calls are made:
        //
        // callback(null, 42);
        // callback(null, 'hello world');
        // callback(new Error("Request failed"));
        // callback(null, undefined);
        //
        // argumentSets looks like:
        //
        // [
        //     [ null, null, new Error("Request failed"), null ],
        //     [ 42, 'hello world', undefined, null ]
        // ]

        var argumentSets = [ ];
        var callCount = 0;

        function check() {
            if (callCount === functions.length) {
                doneCallback.apply(null, argumentSets);
            }
        }

        function call(i) {
            functions[i].call(null, function () {
                var j;
                for (j = 0; j < arguments.length; ++j) {
                    if (!argumentSets[j]) {
                        argumentSets[j] = [ ];
                    }

                    argumentSets[j][i] = arguments[j];
                }

                ++callCount;
                check();
            });
        }

        var i;
        for (i = 0; i < functions.length; ++i) {
            call(i);
        }

        check(); // In case we have zero functions
    }

    var plugins = [ ];

    // resolveRawName :: RawName -> ModuleName
    function resolveRawName(rawName) {
        return rawName;
    }

    // resolveModuleName :: ModuleName -> (ResourceName,Plugin)
    function resolveModuleName(moduleName) {
        var i;
        for (i = 0; i < plugins.length; ++i) {
            var plugin = plugins[i];
            var resolved = plugin.resolve(moduleName);
            if (resolved) {
                return [ resolved, plugin ];
            }
        }

        throw new Error("Could not resolve module name " + moduleName);
    }

    // announces :: Map ModuleName (IO ())
    var announces = { };

    // requests :: [ResourceName]
    var requests = [ ];

    function canRequest(resourceName) {
        return !hasOwn(announces, resourceName) && requests.indexOf(resourceName) < 0;
    }

    function requestModule(moduleName, callback) {
        var pair = resolveModuleName(moduleName);
        if (!canRequest(pair[0])) {
            callback(null);
            return;
        }

        pair[1].request(pair[0], callback);
    }

    // pushedValues :: Map ModuleName Object
    var pushedValues = { };

    // pullingFunctions :: Map ModuleName (Error -> Object -> IO ())
    var pullingFunctions = { };

    // Report that moduleName has the given value.
    function push(moduleName, value) {
        if (hasOwn(pushedValues, moduleName)) {
            throw new Error("Cannot push to " + moduleName + " which already has value " + pushedValues[moduleName]);
        }

        pushedValues[moduleName] = value;

        if (hasOwn(pullingFunctions, moduleName)) {
            var functions = pullingFunctions[moduleName];
            delete pullingFunctions[moduleName];
            map(functions, function (fn) {
                fn(null, value);
            });
        }
    }

    // Wait for moduleName to be pushed a value, and call the callback when it
    // is.
    function pull(moduleName, callback) {
        if (hasOwn(pushedValues, moduleName)) {
            callback(null, pushedValues[moduleName]);
        } else {
            if (!hasOwn(pullingFunctions, moduleName)) {
                pullingFunctions[moduleName] = [ ];
            }
            pullingFunctions[moduleName].push(callback);

            if (hasOwn(announces, moduleName)) {
                // FIXME Should this be here?
                announces[moduleName]();
            }
        }
    }

    // Convenience function.
    function pullMany(moduleNames, callback) {
        var pullFunctions = map(moduleNames, function (moduleName) {
            return function (callback) {
                return pull(moduleName, callback);
            };
        });
        callbackMany(pullFunctions, callback);
    }

    function announce(moduleName, callback) {
        if (hasOwn(announces, moduleName)) {
            throw new Error("Module " + moduleName + " already announced");
        } else {
            if (hasOwn(pullingFunctions, moduleName)) {
                callback();
            } else {
                announces[moduleName] = callback;
            }
        }
    }

    function load(deps, loadedCallback) {
        var moduleNames = map(deps, resolveRawName);
        pullMany(moduleNames, loadedCallback);

        var requestFunctions = map(moduleNames, function (moduleName) {
            return function (callback) {
                requestModule(moduleName, callback);
            };
        });
        callbackMany(requestFunctions, function (errs) {
            // TODO Report erros
        });
    }

    function execute(deps, callback, doneCallback) {
        // TODO Handle exports, etc. specially
        load(deps, function (errs, values) {
            var errorReported = false;
            if (errs) {
                map(errs, function (err) {
                    if (err) {
                        errorReported = true;
                    }
                });
            }

            if (errorReported) {
                doneCallback(errs);
            } else {
                var value = callback.apply(null, values);

                doneCallback(null, value);
            }
        });
    }

    function definePlugin(plugin) {
        if (typeof plugin === 'function') {
            plugin = plugin(api);
        }

        plugins.push(plugin);
    }

    var api = {
        definePlugin: definePlugin,
        load: load,
        execute: execute,

        push: push,
        pull: pull,
        announce: announce,
        requestModule: requestModule,

        resolveRawName: resolveRawName,
        resolveModuleName: resolveModuleName
    };

    window.unrequire = api;
}());

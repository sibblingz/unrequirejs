// NOTE: Lines between and including those with
// @{{{ and @}}}
// will be removed upon compilation.
// Lines with @ in them should be handled with care.
//
// NOTE: unrequire is meant to be build by prefixing
//     var unrequire =
// so don't put any weird stuff before the closure.

(function () {
    // To embed in-line without pollution:
    //
    // function unrequire() {
    //     var window = { };
    //     /* unrequire sources */
    //     return window.unrequire;
    // }

    // Feature flags
    // (overwritten by build system)
//@{{{
    var ENABLE_PACKAGES = true;
    var LOGGING = false;
    var CHECK_CYCLES = true;
//@}}}

    // Note: The Haskell type annotations are (obviously) not 100% accurate
    // (and may hide some things), but it helps in understanding the flow of
    // e.g. module identifier types.

    if (LOGGING) {
        var log = console.log.bind(console);
    }

    var object = { }; // Shortcut to get access to Object.prototype

    function hasOwn(object, property) {
        return object.hasOwnProperty.call(object, property);
    }

    function isPlainOldObject(x) {
        return object.toString.call(x) === '[object Object]';
    }

    function map(array, fn) {
        return array.map(fn);
    }

    function isArray(x) {
        return Array.isArray(x);
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
        var called = false;

        function check() {
            if (!called && callCount === functions.length) {
                called = true;
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

    // normalizeRawName :: RawName -> Configuration -> ModuleName
    function normalizeRawName(rawName, config) {
        if (/^\.\.?(\/|$)/.test(rawName)) {
            // Explicitly relative URL; base off of cwd
            rawName = config['cwd'] + '/' + rawName; // FRAGILE
        }

        // wtb Array#reduce
        var i;
        for (i = 0; i < plugins.length; ++i) {
            var plugin = plugins[i];
            if (plugin['normalize']) {
                rawName = plugin['normalize'](rawName);
            }
        }
        return rawName;
    }

    // resolveModuleName :: ModuleName -> (ResourceName,Plugin)
    function resolveModuleName(moduleName) {
        var i;
        for (i = 0; i < plugins.length; ++i) {
            var plugin = plugins[i];
            var resolved = plugin['resolve'](moduleName);
            if (resolved) {
                return [ resolved, plugin ];
            }
        }

        throw new Error("Could not resolve module name " + moduleName);
    }

    // announces :: Map ModuleName (IO ())
    var announces = { };

    // announced :: [ModuleName]
    var announced = [ ];

    // requestCallbacks :: Map ResourceName (Error -> IO ())
    var requestCallbacks = { };

    // requestErrors :: Map ResourceName Error
    var requestErrors = { };

    // pushedValues :: Map ModuleName Object
    var pushedValues = { };

    // pullingFunctions :: Map ModuleName (Error -> Object -> IO ())
    var pullingFunctions = { };

    if (CHECK_CYCLES) {
        // dependencyGraph :: Map String [String]
        var dependencyGraph = { };

        function addDependency(from, to) {
            if (hasOwn(dependencyGraph, from)) {
                dependencyGraph[from].push(to);
            } else {
                dependencyGraph[from] = [ to ];
            }
        }

        // scc :: Map String [String] -> [[String]]
        function scc(graph) {
            var vertexIndices = { };
            var vertexLowLinks = { };

            var index = 0;
            var stack = [ ];

            var sccs = [ ];

            function strongConnect(v) {
                vertexIndices[v] = index;
                vertexLowLinks[v] = index;
                ++index;
                stack.push(v);

                if (hasOwn(graph, v)) {
                    graph[v].forEach(function (w) {
                        if (!hasOwn(vertexIndices, w)) {
                            strongConnect(w);
                            vertexLowLinks[v] = Math.min(vertexLowLinks[v], vertexLowLinks[w]);
                        } else if (stack.indexOf(w) >= 0) {
                            vertexLowLinks[v] = Math.min(vertexLowLinks[v], vertexIndices[w]);
                        }
                    });
                }

                if (vertexLowLinks[v] === vertexIndices[v]) {
                    var scc = [ ];
                    var w;
                    do {
                        w = stack.pop();
                        scc.push(w);
                    } while (w !== v);
                    sccs.push(scc);
                }
            }

            Object.keys(graph).forEach(function (vertex) {
                if (!hasOwn(vertexIndices, vertex)) {
                    strongConnect(vertex);
                }
            });

            return sccs;
        }

        function getCircularDependencies() {
            var sccs = scc(dependencyGraph);
            return sccs.filter(function (scc) {
                return scc.length > 1;
            });
        }
    }

    function needsRequest(moduleName) {
        return !hasOwn(requestErrors, moduleName) && !hasOwn(pushedValues, moduleName) && !hasOwn(announces, moduleName) && announced.indexOf(moduleName) < 0;
    }

    function requestModule(moduleName, config, callback) {
        // FIXME Config is not accounted for much here

        var pair = resolveModuleName(moduleName);
        var resourceName = pair[0];

        if (hasOwn(requestCallbacks, resourceName)) {
            // Module request is executing
            requestCallbacks[resourceName].push(callback);
        } else if (hasOwn(requestErrors, resourceName)) {
            // Module request has already executed
            callback(requestErrors[resourceName]);
        } else {
            // Module not yet requested
            if (LOGGING) {
                log("Requesting resource " + resourceName);
            }

            requestCallbacks[resourceName] = [ callback ];
            pair[1]['request'](resourceName, config, function (err) {
                if (LOGGING) {
                    log("Done requesting resource " + resourceName);
                }

                requestErrors[resourceName] = err;

                var callbacks = requestCallbacks[resourceName];
                delete requestCallbacks[resourceName];

                var callback;
                while ((callback = callbacks.pop())) {
                    callback(err);
                }
            });
        }
    }

    // Report that moduleName has the given value.
    function push(moduleName, value) {
        if (hasOwn(pushedValues, moduleName)) {
            throw new Error("Cannot push to " + moduleName + " which already has value " + pushedValues[moduleName]);
        }

        if (LOGGING) {
            log("Pushing module " + moduleName + " with value " + value);
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
        if (LOGGING) {
            log("Pulling module " + moduleName);
        }

        if (hasOwn(pushedValues, moduleName)) {
            callback(null, pushedValues[moduleName]);
        } else {
            if (!hasOwn(pullingFunctions, moduleName)) {
                pullingFunctions[moduleName] = [ ];
            }
            pullingFunctions[moduleName].push(callback);

            if (hasOwn(announces, moduleName) && announced.indexOf(moduleName) < 0) {
                announced.push(moduleName);
                var announce = announces[moduleName];
                //delete announces[moduleName];
                // FIXME Should this be here?
                announce();
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
            // We need to allow package definitions to
            // *override* announces when the corresponding
            // script is called.  The packages system will
            // eventually be unified with the paths: system, so
            // this won't be a problem then.
            delete announces[moduleName];
            if (LOGGING) {
                log("Overriding announce for module " + moduleName);
            }
            //throw new Error("Module " + moduleName + " already announced");
        } else {
            if (LOGGING) {
                log("Announcing module " + moduleName);
            }
        }

        if (hasOwn(pullingFunctions, moduleName)) {
            announced.push(moduleName);
            callback();
        } else {
            announces[moduleName] = callback;
        }
    }

    function loadModules(moduleNames, config, loadedCallback) {
        if (LOGGING) {
            log("Loading modules " + moduleNames.join(", "));
        }

        pullMany(moduleNames, loadedCallback);

        var requestFunctions = map(moduleNames, function (moduleName) {
            return function (callback) {
                if (needsRequest(moduleName)) {
                    requestModule(moduleName, config, callback);
                } else {
                    callback(null);
                };
            }
        });
        callbackMany(requestFunctions, function (errs) {
            // TODO Report errors (typically missing
            // announces/pushes)
        });
    }

    function execute(deps, config, factory, doneCallback, exportsCallback) {
        // AMD compliance: require
        var extraValues = [ ];
        if (deps[0] === 'require') {
            extraValues.push(null); // TODO
            deps = deps.slice(1);
        }

        // AMD compliance: module and exports
        if (deps[0] === 'exports' && deps[1] === 'module') {
            var exports = { };
            var module = {
                'exports': exports
            };

            extraValues.push(exports, module);
            deps = deps.slice(2);

            exportsCallback(exports);
        }

        var moduleNames = map(deps, function (dep) {
            return normalizeRawName(dep, config);
        });

        loadModules(moduleNames, config, function (errs, values) {
            // TODO Move this filtering to loadModules?
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
                var value = factory;
                if (typeof factory === 'function') {
                    value = factory.apply(null, extraValues.concat(values));
                }

                doneCallback(null, value);
            }
        });

        return moduleNames;
    }

    // define([name,] [deps,] [factory])
    function parseDefineArguments(args) {
        // Note: args may be an arguments object

        var name = null;
        var config = { };
        var deps = [ ];
        var factoryIndex = Math.min(args.length - 1, 2);
        var factory = args[factoryIndex];

        var i = 0;
        if (i < factoryIndex && typeof args[i] === 'string') {
            name = args[i++];
        }
        if (i < factoryIndex && isArray(args[i])) {
            deps = args[i++].slice();
        }

        return {
            'name': name,
            'config': config,
            'deps': deps,
            'factory': factory
        };
    }

    // require([config,] [deps,] [factory])
    function parseRequireArguments(args) {
        // Note: args may be an arguments object

        // TODO require(string)
        if (typeof args[0] === 'string') {
            throw new Error("require(string) not supported");
        }

        var config = { };
        var deps = [ ];
        var factory = null;

        var i = 0;
        if (isPlainOldObject(args[i])) {
            config = args[i++];
        }
        if (isArray(args[i])) {
            deps = args[i++].slice();
        }
        factory = args[i];

        return {
            'config': config,
            'deps': deps,
            'factory': factory
        };
    }

    // createDefaultConfiguration :: Configuration
    function createDefaultConfiguration() {
        return {
            'cwd': '.'
        };
    }

    // joinConfigurations :: Configuration -> PartialConfiguration -> Configuration
    function joinConfigurations(left, right) {
        // TODO
        var cwd = left['cwd'];
        if (right['cwd']) {
            // FIXME Not very robust
            cwd += '/' + right['cwd'];
        }

        var baseUrl = left['baseUrl'];
        if (right['baseUrl']) {
            baseUrl = right['baseUrl'];
        }

        return {
            'cwd': cwd,
            'baseUrl': baseUrl
        };
    }

    function definePlugin(plugin) {
        if (typeof plugin === 'function') {
            plugin = plugin(api);
        }

        plugins.push(plugin);
    }

    function handleDefine(args, config, callback) {
        var moduleName = normalizeRawName(args['name'], config);

        if (LOGGING) {
            log("Define " + moduleName + " " + JSON.stringify(args));
        }

        announce(moduleName, function () {
            var pushed = false;

            var depModuleNames = execute(args['deps'], config, args['factory'], function (errs, value) {
                if (errs) return callback(errs);

                if (!pushed) {
                    push(moduleName, value);
                    pushed = true;
                }

                callback(null);
            }, function (value) {
                if (!pushed) {
                    push(moduleName, value);
                    pushed = true;
                }
            });

            if (CHECK_CYCLES) {
                depModuleNames.forEach(function (dep) {
                    addDependency(moduleName, dep);
                });

                var cycles = getCircularDependencies();
                cycles.forEach(function (cycle) {
                    console.error("Circular dependency detected between the following modules:\n" + cycle.join("\n"));
                });
            }
        });
    }

    function handleRequire(args, config, callback) {
        if (LOGGING) {
            log("Require " + JSON.stringify(args));
        }

        execute(args['deps'], config, args['factory'], function (errs, value) {
            callback(errs);
        });
    }

    var api = {
        'definePlugin': definePlugin,
        //'load': load,
        'execute': execute,

        'push': push,
        'pull': pull,
        'announce': announce,
        'requestModule': requestModule,

        'normalizeRawName': normalizeRawName,
        'resolveModuleName': resolveModuleName,

        'parseDefineArguments': parseDefineArguments,
        'parseRequireArguments': parseRequireArguments,

        'createDefaultConfiguration': createDefaultConfiguration,
        'joinConfigurations': joinConfigurations,

        'handleDefine': handleDefine,
        'handleRequire': handleRequire
    };

    if (ENABLE_PACKAGES) {
        api['definePackage'] = function definePackage(rawPackageName, rawModuleNames, config) {
            var packageName = normalizeRawName(rawPackageName);
            map(rawModuleNames, function (rawModuleName) {
                var moduleName = normalizeRawName(rawModuleName);
                announce(moduleName, function () {
                    if (LOGGING) {
                        log("Rerouting " + moduleName + " to " + packageName);
                    }

                    // Loading the package re-announces the
                    // module.  See announce() for some
                    // details.

                    var pair = resolveModuleName(moduleName);
                    var resourceName = pair[0];
                    requestErrors[resourceName] = null;

                    requestModule(packageName, config, function (err) {
                        // TODO Better error reporting
                        if (err) throw err;
                        if (!hasOwn(pushedValues, moduleName) && !hasOwn(announces, moduleName) && announced.indexOf(moduleName) < 0) {
                            throw new Error("Could not find module " + rawModuleName + " in package " + rawPackageName);
                        }

                        // The module is now pushed; no more work to do
                    });
                });
            });
        };
    }

    if (typeof window === 'object' && window) {
        // Browsers
        window['unrequire'] = api;
    } else if (typeof module === 'object' && module) {
        // Node.JS
        module['exports'] = api;
    }

    return api;
}());

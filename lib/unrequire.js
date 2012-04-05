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
    var LOGGING = false;
//@}}}

    // Note: The Haskell type annotations are (obviously) not 100% accurate
    // (and may hide some things), but it helps in understanding the flow of
    // e.g. module identifier types.

    if (LOGGING) {
        var log = console.log.bind(console);
    }

    var object = { }; // Shortcut to get access to Object.prototype

    function call(fn) { return fn(); }

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

    // plugins :: [Plugin]
    var plugins = [ ];

    // pluginPriorities :: [Number]
    // Array values correspond with `plugins`
    // Higher values in front (i.e. highest at [0])
    var pluginPriorities = [ ];

    // normalizeRawName :: RawName -> Configuration -> (ModuleName, Plugin)
    function normalizeRawName(rawName, config) {
        if (/^\.\.?(\/|$)/.test(rawName)) {
            // Explicitly relative URL; base off of cwd
            rawName = config['cwd'] + '/' + rawName; // FRAGILE
        }

        var i;
        for (i = 0; i < plugins.length; ++i) {
            var plugin = plugins[i];
            if (plugin['normalize']) {
                var moduleName = plugin['normalize'](rawName);
                if (moduleName != null) { // Fuzzy
                    return [ moduleName, plugin ];
                }
            }
        }

        throw new Error("Could not normalize name " + rawName);
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

    function checkCycles() {
        var cycles = getCircularDependencies();
        cycles.forEach(function (cycle) {
            if (cycle.length === 1) {
                return;
            }

            if (cycle.every(hasOwn.bind(null, pushedValues))) {
                // Ignore cycles if they have already been resolved
                return;
            }

            console.error("Circular dependency detected between the following modules:\n" + cycle.join("\n"));
        });
    }

    function needsRequest(moduleName) {
        return !hasOwn(requestErrors, moduleName)
            && !hasOwn(pushedValues, moduleName)
            && !hasOwn(announces, moduleName)
            && announced.indexOf(moduleName) < 0;
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
            throw new Error("Module " + moduleName + " already announced");

            // We need to allow package definitions to
            // *override* announces when the corresponding
            // script is called.  The packages system will
            // eventually be unified with the paths: system, so
            // this won't be a problem then.
            delete announces[moduleName];
            if (LOGGING) {
                log("Overriding announce for module " + moduleName);
            }
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

    function getErrors(errs) {
        var errorReported = false;
        if (errs) {
            map(errs, function (err) {
                if (err) {
                    errorReported = true;
                }
            });
        }

        if (errorReported) {
            return errs;
        } else {
            //return undefined;
        }
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

        if (typeof args[0] === 'string') {
            return args[0];
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

    function definePlugin(name, plugin, priority) {
        if (typeof plugin === 'function') {
            plugin = plugin(api);
        }

        priority = priority || 0;

        var i;
        for (i = 0; i < pluginPriorities.length; ++i) {
            if (pluginPriorities[i] <= priority) {
                pluginPriorities.splice(i, 0, priority);
                plugins.splice(i, 0, plugin);
                return;
            }
        }

        pluginPriorities.push(priority);
        plugins.push(plugin);
    }

    // type ModuleLoader
    //    = [(ModuleName, Plugin)]    -- ^ Modules to load
    //   -> Configuration
    //   -> Factory
    //   -> IO (Maybe Error, Object)  -- ^ Callback to push result.
    //   -> ModuleLoader              -- ^ "Next" to delegate unloaded modules.
    //   -> IO ()

    // loadModulesFinal :: ModuleLoader'
    function loadModulesFinal(modulePairs, config, factory, callback) {
        var loadCallbacks = modulePairs.map(function (pair) {
            return function (callback) {
                pair[1]['load'](pair[0], config, callback);
            };
        });

        callbackMany(loadCallbacks, function (err, values) {
            err = getErrors(err);
            if (err) return callback(err);

            var value = typeof factory === 'function'
                ? factory.apply(null, values)
                : factory;

            callback(null, value);
        });
    }

    // loadModulesOf :: Int -> ModuleLoader'
    function loadModulesOf(pluginIndex, modulePairs, config, factory, callback) {
        if (pluginIndex >= plugins.length) {
            loadModulesFinal(modulePairs, config, factory, callback);
            return;
        }

        function next(modulePairs, config, factory, callback) {
            loadModulesOf(pluginIndex + 1, modulePairs, config, factory, callback);
        }

        var plugin = plugins[pluginIndex];
        var loadModules = plugin['loadModules'];
        if (loadModules) {
            loadModules.call(plugin, modulePairs, config, factory, callback, next);
        } else {
            next(modulePairs, config, factory, callback);
        }
    }

    // loadModules :: ModuleLoader'
    var loadModules = loadModulesOf.bind(null, 0);

    function handleDefine(args, config, callback) {
        var moduleName = normalizeRawName(args['name'], config)[0];

        if (LOGGING) {
            log("Define " + moduleName + " " + JSON.stringify(args));
        }

        var factory = args['factory'];
        var deps = args['deps'];

        announce(moduleName, function () {
            var modulePairs = map(deps, function (dep) {
                return normalizeRawName(dep, config);
            });

            modulePairs.forEach(function (pair) {
                addDependency(moduleName, pair[0]);
            });
            checkCycles();

            loadModules(modulePairs, config, factory, function on_loadedModules(err, value) {
                if (err) {
                    callback(err);
                } else {
                    push(moduleName, value);
                    callback(null);
                }
            });
        });
    }

    function handleRequire(args, config, callback) {
        if (LOGGING) {
            log("Require " + JSON.stringify(args));
        }

        if (typeof args === 'string') {
            // FIXME args['config'] and config should be merged
            var moduleName = normalizeRawName(args, config);
            if (hasOwn(pushedValues, moduleName)) {
                return pushedValues[moduleName];
            } else {
                throw new Error("Module '" + args + "' not loaded");
            }
        }

        var factory = args['factory'];

        var modulePairs = map(args['deps'], function (dep) {
            return normalizeRawName(dep, config);
        });

        loadModules(modulePairs, config, factory, callback);
    }

    var api = {
        'definePlugin': definePlugin,
        //'load': load,
        //'execute': execute,

        'push': push,
        'pull': pull,
        'announce': announce,

        'normalizeRawName': normalizeRawName,

        'parseDefineArguments': parseDefineArguments,
        'parseRequireArguments': parseRequireArguments,

        'createDefaultConfiguration': createDefaultConfiguration,
        'joinConfigurations': joinConfigurations,

        'handleDefine': handleDefine,
        'handleRequire': handleRequire
    };

    if (typeof window === 'object' && window) {
        // Browsers
        window['unrequire'] = api;
    } else if (typeof module === 'object' && module) {
        // Node.JS
        module['exports'] = api;
    }

    return api;
}());

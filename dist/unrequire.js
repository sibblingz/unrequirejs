;// I am awesome
(function () {
;// I am awesome
(function (window) {
/**@const*/ var ENABLE_PACKAGES = true;
/**@const*/ var LOGGING = true;
/**@const*/ var ENABLE_INNER_EXPORTS = true;
var unrequire = 
// NOTE: Lines between and including those with
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
//*/
;
(function () {

if (typeof loadScript === 'function') {
    // Spaceport Android
    return;
}

try {
    window.document.createElement('script');
} catch (e) {
    // DOM not supported; die
    return;
}

unrequire['definePlugin']("browser", function (un) {
    function throwingCallback(err) {
        if (err) {
            throw err;
        }
    }

    var document = window.document;

    var IS_OPERA = Object.prototype.toString.call(window.opera) === '[object Opera]';
    var IS_IE = document.all && !IS_OPERA;

    // MIT: http://trac.webkit.org/wiki/DetectingWebKit
    var IS_WEBKIT = typeof navigator !== 'undefined' && navigator && / AppleWebKit\//.test(navigator.userAgent);

    var ATTEMPT_SYNC = false;

    var goodResponseCodes = [ 200, 204, 206, 301, 302, 303, 304, 307 ];

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
    // Firefox, Opera.  For IE, we maintain a define key (which
    // is the currently executing script) and use it to
    // reference different define queues; for the other
    // browsers, there is no known key until script completion
    // (so we use a single queue).

    // Only used if useInteractiveScript
    // defineQueueMap :: Map RequestName [DefineArguments]
    var defineQueueMap = { };

    // Only used if not useInteractiveScript
    // defineQueue :: [DefineArguments]
    var defineQueue = [ ];

    function canSkipDefineQueue() {
        // HACK to get global defines to work
        return defineUses === 1;
    }

    function flushDefineQueue(queue, requestName, config) {
        var args;
        while ((args = queue.shift())) {
            if (args.name === null) {
                args.name = requestName;
            }

            un['handleDefine'](args, config, throwingCallback);
        }
    }

    var useInteractiveScript = IS_IE;
    function getInteractiveScript() {
        var scripts = document.getElementsByTagName('script');
        var i, script;
        for (i = 0; (script = scripts[i]); ++i) {
            if (script.readyState === 'interactive') {
                return script;
            }
        }
        return null;
    }

    // If false, we haven't complained to the user about the Webkit bug.  See
    // loadScriptSync for more details.
    var webkitOnloadFlag = false;

    function loadScriptSync(scriptName) {
        // Returns false to instead load asyncronously.

        // We provide synchronous script loading via XHR specifically to work
        // around a Webkit bug.  After document.onload is called, any script
        // dynamically loaded will be loaded from Webkit's local cache; *no
        // HTTP request is made at all*.
        //
        // We do *not* use your typical cache bust (e.g. appending Date.now()
        // to the URI) because that trashes all of the user's breakpoints.
        if (!IS_WEBKIT) {
            return false;
        }

        if (/loaded|complete/.test(document.readyState)) {
            if (!webkitOnloadFlag) {
                console.warn("Scripts being loaded after document.onload; scripts may be loaded from out-of-date cache");
                webkitOnloadFlag = true;
            }

            console.warn("Script loaded from possibly out-of-date cache: " + scriptName);

            // Loading sync at this point is just as bad as loading async, so
            // just load async.
            return false;
        }

        var scriptSource;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', scriptName, false);
            xhr.send(null);

            if (goodResponseCodes.indexOf(xhr.status) < 0) {
                return false;
            }

            scriptSource = xhr.responseText;
            scriptSource += '\n\n//*/\n//@ sourceURL=' + scriptName;
        } catch (e) {
            return false;
        }

        var fn;
        try {
            fn = Function(scriptSource);
        } catch (e) {
            // Syntax error; load async and show user.  (Webkit's cache now
            // contains the updated copy, so the user will be able to see the
            // latest version's syntax error.)
            return false;
        }

        // Don't wrap user code in try/catch
        fn();

        return true;
    }

    function loadScript(scriptName, callback) {
        if (ATTEMPT_SYNC) {
            if (loadScriptSync(scriptName)) {
                callback(null);
                return;
            }
        }

        var script = document.createElement('script');
        script.async = true;

        if (useInteractiveScript) {
            script.setAttribute('data-scriptName', scriptName);
        }

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

        // TODO Better error catching

        script[onerror] = function () {
            callback(new Error('Failed to load script'));
        };

        // Remember: we need to attach event handlers before
        // assigning `src`.  Events may be fired as soon as we set
        // `src`.
        script.src = scriptName;

        document['head'].appendChild(script);
    }

    function define() {
        var args = un['parseDefineArguments'](arguments);

        if (canSkipDefineQueue() && args.name) {
            // HACK
            un['handleDefine'](args, '(global)', throwingCallback);
            return;
        }

        var queue;
        if (useInteractiveScript) {
            var scriptName = getInteractiveScript().getAttribute('data-scriptName');
            queue = defineQueueMap[scriptName];
        } else {
            queue = defineQueue;
        }
        queue.push(args);
    }

    define.amd = { };

    var oldDefine;
    var defineUses = 0;

    var globalConfiguration = un['createDefaultConfiguration']();

    function globalRequire() {
        var args = un['parseRequireArguments'](arguments);
        un['handleRequire'](args, globalConfiguration, throwingCallback);
    }
    globalRequire['definePackage'] = function definePackage(rawPackageName, rawModuleNames) {
        un['definePackage'](rawPackageName, rawModuleNames, globalConfiguration);
    };

    // TODO Rename to unrequire and have unrequire.load
    window['require'] = globalRequire;

    // TODO I don't like this but modules seem to depend upon
    // it being present without a require
    window['define'] = define;
    ++defineUses;

    var requestedModules = [ ];

    return {
        // normalize :: RawName -> Maybe ModuleName
        'normalize': function normalize(rawName) {
            var filename = rawName.split('/').slice(-1)[0];
            if (!/\.js$/i.test(filename)) {
                rawName += '.js';
            }

            // Awesomely cheap way to normalize a path.  =]
            var anchor = document.createElement('a');
            anchor.href = rawName;
            return anchor.href;
        },

        // load :: ModuleName -> Configuration -> IO (Maybe Error, Object) -> IO ()
        'load': function load(moduleName, config, callback) {
            var filename = moduleName.split('/').slice(-1)[0];
            if (!/(\.js)?$/i.test(filename)) {
                return callback(new Error("Only .js modules supported"));
            }

            un['pull'](moduleName, callback);

            if (requestedModules.indexOf(moduleName) >= 0) {
                // Already requested; pull will handle the rest
                return;
            }

            requestedModules.push(moduleName);

            var newCwd = moduleName.replace(/\/[^\/]+$/, '');
            config = un['joinConfigurations'](config, { }); // HACK to clone config
            config['cwd'] = newCwd;

            if (defineUses === 0) {
                oldDefine = window['define'];
            }
            window['define'] = define;
            ++defineUses;

            if (useInteractiveScript) {
                defineQueueMap[moduleName] = [ ];
            }

            loadScript(moduleName, function (err) {
                --defineUses;
                if (defineUses < 0) {
                    throw new Error("Bad defineUses state; please report to unrequire developers!");
                }
                if (defineUses === 0) {
                    window['define'] = oldDefine;
                }

                if (err) return callback(err);

                if (useInteractiveScript) {
                    flushDefineQueue(defineQueueMap[moduleName], moduleName, config);
                } else {
                    flushDefineQueue(defineQueue, moduleName, config);
                }

                // pull will call callback
            });
        }
    };
});

}());
//*/
;
unrequire['definePlugin']("Common.JS", function (un) {
    function throwingCallback(err) {
        if (err) {
            throw err;
        }
    }

    var NAME_REQUIRE = 'require';
    var NAME_EXPORTS = 'exports';
    var NAME_MODULE = 'module';

    function makeRequire(config) {
        return function require(/* ... */) {
            var args = un['parseRequireArguments'](arguments);
            un['handleRequire'](args, config, throwingCallback);
        };
    }

    var slice = Array.prototype.slice;

    // Partially applies `fn` with `partialArgs`.
    function partialA(fn, partialArgs) {
        return function(/* newArgs... */) {
            var newArgs = slice.call(arguments);
            return fn.apply(this, partialArgs.concat(newArgs));
        };
    }

    return {
        // normalize :: RawName -> Maybe ModuleName
        'normalize': function normalize(rawName) {
            if ([ NAME_REQUIRE, NAME_EXPORTS, NAME_MODULE ].indexOf(rawName) >= 0) {
                return rawName;
            } else {
                return null;
            }
        },

        // loadModules :: ModuleLoader
        'loadModules': function loadModules(modulePairs, config, factory, callback, next) {
            var moduleCount = modulePairs.length;
            if (typeof factory !== 'function' || !moduleCount) {
                return next.apply(this, arguments);
            }

            if (modulePairs[0][0] === NAME_REQUIRE) {
                var partialArgs = [ makeRequire(config) ];
                var modulesConsumed = 1;

                if (moduleCount >= 3
                 && modulePairs[1][0] === NAME_EXPORTS
                 && modulePairs[2][0] === NAME_MODULE
                ) {
                    var exports = { };
                    var module = { 'exports': exports };
                    partialArgs.push(exports, module);
                    modulesConsumed = 3;

                    callback(null, exports);
                    callback = function () { }; // TODO Check for errors
                }

                factory = partialA(factory, partialArgs);
                modulePairs = modulePairs.slice(modulesConsumed);
            }

            next(modulePairs, config, factory, callback);
        }
    };
});
//*/
;
}(window));
//*/
;
}());

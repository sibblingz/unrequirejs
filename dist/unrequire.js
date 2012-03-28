;// I am awesome
(function () {
;// I am awesome
(function (window) {
/**@const*/ var ENABLE_PACKAGES = true;
/**@const*/ var LOGGING = false;
var unrequire = 
// upon compilation.  Lines with @ in them should be handled with care.
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

    // Note: The Haskell type annotations are (obviously) not 100% accurate
    // (and may hide some things), but it helps in understanding the flow of
    // e.g. module identifier types.

    var log;
    if (LOGGING) {
        log = console.log.bind(console);
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

    function load(deps, config, loadedCallback) {
        var moduleNames = map(deps, function (dep) {
            return normalizeRawName(dep, config);
        });

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

    function execute(deps, config, factory, doneCallback) {
        // TODO Handle exports, etc. specially
        load(deps, config, function (errs, values) {
            // TODO Move this filtering to load
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
                    value = factory.apply(null, values);
                }

                doneCallback(null, value);
            }
        });
    }

    // define([name,] [config,] [deps,] [callback])
    function parseDefineArguments(args) {
        // Note: args may be an arguments object

        var name = null;
        var config = { };
        var deps = [ ];
        var callback = null;

        var i = 0;
        if (typeof args[i] === 'string') {
            name = args[i++];
        }
        if (isPlainOldObject(args[i])) {
            config = args[i++];
        }
        if (isArray(args[i])) {
            deps = args[i++].slice();
        }
        factory = args[i];

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
        announce(moduleName, function () {
            execute(args['deps'], config, args['factory'], function (errs, value) {
                if (errs) return callback(errs);

                push(moduleName, value);
                callback(null);
            });
        });
    }

    function handleRequire(args, config, callback) {
        execute(args['deps'], config, args['factory'], function (errs, value) {
            callback(errs);
        });
    }

    var api = {
        'definePlugin': definePlugin,
        'load': load,
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

unrequire['definePlugin'](function (un) {
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

    return {
        // normalize :: RawName -> ModuleName
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

            if (useInteractiveScript) {
                defineQueueMap[requestName] = [ ];
            }

            loadScript(requestName, function (err) {
                --defineUses;
                if (defineUses < 0) {
                    throw new Error("Bad defineUses state; please report to unrequire developers!");
                }
                if (defineUses === 0) {
                    window['define'] = oldDefine;
                }

                if (err) return callback(err);

                if (useInteractiveScript) {
                    flushDefineQueue(defineQueueMap[requestName], requestName, config);
                } else {
                    flushDefineQueue(defineQueue, requestName, config);
                }

                callback(null);
            });
        }
    };
});

}());
//*/
;
if (typeof module !== 'undefined' && typeof exports !== 'undefined' && typeof require === 'function') {

var nodeRequire = require;
var unrequire = nodeRequire('./unrequire.js');
unrequire.definePlugin(function (un) {
    var path = nodeRequire('path');
    var vm = nodeRequire('vm');
    var fs = nodeRequire('fs');

    var globalConfiguration = un['createDefaultConfiguration']();

    function globalRequire() {
        var args = un['parseRequireArguments'](arguments);
        un['handleRequire'](args, globalConfiguration, function (err) {
            throw err;
        });
    }
    globalRequire['definePackage'] = function definePackage(rawPackageName, rawModuleNames) {
        un['definePackage'](rawPackageName, rawModuleNames, globalConfiguration);
    };

    // TODO Rename to unrequire and have unrequire.load
    unrequire.require = globalRequire;

    return {
        // normalize :: RawName -> ModuleName
        'normalize': function normalize(rawName) {
            var filename = rawName.split('/').slice(-1)[0];
            if (!/\.js$/i.test(filename)) {
                rawName += '.js';
            }

            return path.normalize(rawName);
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

            var context = vm.createContext({
                require: globalRequire,
                nodeRequire: nodeRequire,
                test: nodeRequire('../tests/test'), // HACK FIXME
                define: function define() {
                    var args = un['parseDefineArguments'](arguments);
                    if (!args.name) {
                        args.name = requestName;
                    }
                    un['handleDefine'](args, config, function (err) {
                        if (err) throw err;
                    });
                }
            });

            var scriptName = requestName;
            // TODO Async read
            var code = fs.readFileSync(scriptName, 'utf8');
            vm.runInContext(code, context, scriptName);
            callback(null);
            // TODO Error handling
        }
    };
});

}
//*/
;
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
    globalRequire['definePackage'] = function definePackage(rawPackageName, rawModuleNames) {
        un['definePackage'](rawPackageName, rawModuleNames, globalConfiguration);
    };

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
//*/
;
}(window));
//*/
;
}());

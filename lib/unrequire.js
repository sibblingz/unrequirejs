// XXX Lines between comments with @{{{ and @}}} are removed when building

//@{{{
(function () {
//@}}}

    //@{{{

    // CommonJS compatibility
    var COMMONJS_COMPAT = true;

    // Aliases support
    var ENABLE_ALIASES = true;

    // Browser support
    var ENABLE_BROWSER = true;

    // Node.JS support
    var ENABLE_NODEJS = true;
    //@}}}

    var queuedModules = { };
    var loadedModules = { };
    var loadingModules = { };

    // Stack of script objects.  Each time we load a script, we push to the
    // stack.  When we encounter a define(), we add a callback to the top
    // element of the stack.  When the script is done loading, we pop from the
    // stack and execute all callbacks.
    //
    // Object syntax is:
    // {
    //   "callbacks": [ ],
    //   "config": { }
    // }
    var scriptStack = [ ];

    // { }.hasOwnProperty and { }.toString are syntax errors, and reusing
    // loadedModules saves bytes after minification.  =]
    var hasOwnProperty = loadedModules.hasOwnProperty;
    var toString = loadedModules.toString;

    // For minification
    var NULL = null;
    var dot = '.';
    var dotdot = '..';

    function hasOwn(obj, name) {
        return obj && hasOwnProperty.call(obj, name);
    }

    function isArray(x) {
        return toString.call(x) === '[object Array]';
    }

    function isPlainOldObject(x) {
        return toString.call(x) === '[object Object]';
    }

    function extend(base, extension) {
        var key;

        for (key in extension) {
            if (hasOwn(extension, key)) {
                base[key] = extension[key];
            }
        }

        return base;
    }

    function clone(object, extension) {
        return extend(extend({ }, object), extension || { });
    }

    function pathSplit(parts) {
        parts = isArray(parts) ? parts : [ parts ];

        var splitParts = [ ];
        var i;

        for (i = 0; i < parts.length; ++i) {
            if (parts[i]) {
                splitParts = splitParts.concat(parts[i].split(/\//g));
            }
        }

        return splitParts;
    }

    function pathNormalize(parts) {
        var newParts = [ ];
        var i;

        for (i = 0; i < parts.length; ++i) {
            if (!parts[i]) {
                // Root
                newParts = [ '' ];
            } else if (parts[i] === dotdot) {
                // Go back
                if (!newParts.length) {
                    newParts = [ dotdot ];
                } else {
                    newParts.pop();
                }
            } else if (parts[i] === dot) {
                // Go here
                if (!newParts.length) {
                    newParts = [ dot ];
                }
            } else {
                // Everything else
                newParts.push(parts[i]);
            }
        }

        return newParts;
    }

    function pathResolve(cwd, baseUrl, parts) {
        cwd = pathNormalize(pathSplit(cwd));
        baseUrl = pathNormalize(pathSplit(baseUrl || dot));
        parts = pathNormalize(pathSplit(parts));

        if (parts[0] === dotdot || parts[0] === dot) {
            // Relative paths are based on cwd
            return pathNormalize(baseUrl.concat(cwd).concat(parts));
        } else if (parts[0] === '') {
            // Absolute path stays absolute
            return parts;
        } else {
            // Implicit relative paths are based on baseUrl
            return baseUrl.concat(parts);
        }
    }

    function pathJoin(parts) {
        return parts
            .join('/')
            .replace(/\/+/g, '/');
    }

    function dirName(path) {
        var parts = pathSplit(path);
        parts = parts.slice(0, parts.length - 1);
        return pathJoin(parts);
    }

    function getScriptName(moduleName, config) {
        if (ENABLE_ALIASES) {
            if (hasOwn(config.aliases, moduleName)) {
                return config.aliases[moduleName];
            }
        }

        var scriptName = pathJoin(pathResolve(config.cwd, config.baseUrl, moduleName));
        scriptName = scriptName + (/\.js$/i.test(scriptName) ? '' : '.js');
        return scriptName;
    }

    function activeScript() {
        return scriptStack[scriptStack.length - 1];
    }

    function getEffectiveConfig(config) {
        var neoConfig = { };

        if (ENABLE_ALIASES) {
            neoConfig.aliases = { };
        }

        function ex(config) {
            if ('baseUrl' in config) {
                // TODO
                neoConfig.baseUrl = config.baseUrl;
            }

            if ('cwd' in config) {
                // TODO
                neoConfig.cwd = config.cwd;
            }

            if (ENABLE_ALIASES && 'aliases' in config) {
                for (var aliasName in config.aliases) {
                    if (!hasOwn(config.aliases, aliasName)) {
                        continue;
                    }

                    var aliasTarget = config.aliases[aliasName];

                    // Aliases are stored by their FQN
                    neoConfig.aliases[aliasName] = getScriptName(aliasTarget, neoConfig);
                }
            }
        }

        for (var i = 0; i < scriptStack.length; ++i) {
            ex(scriptStack[i].config);
        }
        ex(config);

        neoConfig.own = config;

        return neoConfig;
    }

    function beginLoading(config) {
        scriptStack.push({
            config: config.own,
            callbacks: [ ]
        });
    }

    function doneLoading(err, scriptName) {
        // Users may dynamically define or require modules in the callback.
        // The config needs to be on this stack, so we must pop *after*
        // processing all callbacks  The config needs to be on this stack, so
        // we must pop *after* processing all callbacks
        var callbacks = activeScript().callbacks;
        var callback;
        while ((callback = callbacks.pop())) {
            callback(err, scriptName);
        }

        scriptStack.pop();

        if (err) throw err;
    }

    function create(configuration) {
        var context = extend({
            require: req,
            define: def,
            reconfigure: reconfigure,

            userCallback: defaultUserCallback
        }, configuration);

        // Clear this so we don't accidentally use it
        configuration = NULL;

        return context;

        function loadOneSync(scriptName, config) {
            var loaded = context.loadScriptSync(scriptName, clone(config));
            if (loaded) {
                doneLoading(NULL, scriptName);
                return true;
            } else {
                return false;
            }
        }

        function loadOneAsync(scriptName, config) {
            context.loadScriptAsync(scriptName, function (err) {
                doneLoading(err, scriptName);
            }, clone(config));
        }

        function shouldReloadModule(moduleName) {
            return !hasOwn(loadedModules, moduleName) && !hasOwn(loadingModules, moduleName);
        }

        function loadOne(scriptName, config, callback) {
            if (hasOwn(queuedModules, scriptName)) {
                var c = queuedModules[scriptName];
                delete queuedModules[scriptName];

                if (hasOwn(loadingModules, scriptName)) {
                    loadingModules[scriptName].push(callback);
                } else {
                    loadingModules[scriptName] = [ callback ];
                }

                c(scriptName, config);
                return;
            } else if (hasOwn(loadedModules, scriptName)) {
                callback(NULL, loadedModules[scriptName]);
                return;
            } else if (hasOwn(loadingModules, scriptName)) {
                loadingModules[scriptName].push(callback);
                return;
            }

            beginLoading(config);

            loadingModules[scriptName] = [ callback ];

            if (!loadOneSync(scriptName, config)) {
                loadOneAsync(scriptName, config);
            }
        }

        function loadMany(moduleNames, config, callback) {
            var moduleScripts = [ ];
            var moduleValues = [ ];
            var loadCount = 0;
            var callbackCalled = false;

            function check() {
                if (loadCount >= moduleNames.length) {
                    if (callbackCalled) {
                        return;
                    }

                    callbackCalled = true;

                    callback(NULL, moduleValues, moduleScripts);
                }
            }

            function loaded(i, moduleValue) {
                moduleValues[i] = moduleValue;
                ++loadCount;

                check();
            }

            function load(i) {
                var moduleName = moduleNames[i];
                moduleScripts[i] = moduleName;

                if (moduleName === 'require') {
                    loaded(i, function require(/* ... */) {
                        var args = reqArgs.apply(NULL, arguments);
                        var newConfig = args.config;
                        var deps = args.deps;
                        var callback = args.callback;

                        newConfig = clone(config, newConfig);

                        return req(newConfig, deps, callback);
                    });
                } else if (moduleName === 'define') {
                    loaded(i, function define(/* ... */) {
                        var args = defArgs.apply(NULL, arguments);
                        var name = args.name;
                        var newConfig = args.config;
                        var deps = args.deps;
                        var callback = args.callback;

                        newConfig = clone(config, newConfig);

                        return def(name, config, deps, callback);
                    });
                } else if (COMMONJS_COMPAT && moduleName === 'module') {
                    loaded(i, { });
                } else if (COMMONJS_COMPAT && moduleName === 'exports') {
                    // TODO
                    loaded(i, { });
                } else {
                    var moduleScript = getScriptName(moduleName, config);
                    moduleScripts[i] = moduleScript;

                    // TODO More clean cwd
                    var moduleConfig = clone(config, { cwd: dirName(moduleScript) });

                    loadOne(moduleScript, moduleConfig, function (err, moduleValue) {
                        if (err) return callback(err);

                        loaded(i, moduleValue);
                    });
                }
            }

            var i;

            for (i = 0; i < moduleNames.length; ++i) {
                load(i);
            }

            check();
        }

        function defaultUserCallback(scriptName, callback, moduleValues, moduleScripts) {
            var moduleValue; // Default to undefined

            if (callback) {
                moduleValue = callback.apply(NULL, moduleValues);
            }

            if (COMMONJS_COMPAT) {
                if (typeof moduleValue === 'undefined') {
                    // Find the exports module and use that instead
                    var exportsIndex = moduleScripts.indexOf('exports');

                    if (exportsIndex >= 0) {
                        moduleValue = moduleValues[exportsIndex];
                    }
                }
            }

            return moduleValue;
        }

        function reqArgs(config, deps, callback) {
            // TODO require(string)
            if (typeof config === 'string') {
                throw new Error('Not supported');
            }

            if (!isPlainOldObject(config)) {
                // Config omitted
                callback = deps;
                deps = config;
                config = { };
            }

            if (!isArray(deps)) {
                // Dependencies omitted
                callback = deps;
                deps = [ ];
            }

            return {
                config: config,
                deps: deps,
                callback: callback
            };
        }

        function req(/* ... */) {
            // TODO require(string)

            var args = reqArgs.apply(NULL, arguments);
            var config = args.config;
            var deps = args.deps;
            var callback = args.callback;

            var effectiveConfig = getEffectiveConfig(config);
            effectiveConfig = clone(effectiveConfig, { cwd: '' });

            beginLoading(effectiveConfig);

            // TODO Support cwd for require
            loadMany(deps, effectiveConfig, function (err, moduleValues, moduleScripts) {
                if (err) throw err;

                doneLoading(NULL, NULL);

                context.userCallback(NULL, callback, moduleValues, moduleScripts);
            });
        }

        function defArgs(name, config, deps, callback) {
            if (typeof name !== 'string') {
                // Name omitted
                callback = deps;
                deps = config;
                config = name;
                name = NULL;
            }

            if (!isPlainOldObject(config)) {
                // Config omitted
                callback = deps;
                deps = config;
                config = { };
            }

            if (!isArray(deps)) {
                // Dependencies omitted
                callback = deps;
                deps = [ ];
            }

            return {
                name: name,
                config: config,
                deps: deps,
                callback: callback
            };
        }

        function def(/* ... */) {
            var args = defArgs.apply(NULL, arguments);
            var name = args.name;
            var config = args.config;
            var deps = args.deps;
            var callback = args.callback;

            var effectiveConfig = getEffectiveConfig(config);

            function load(err, scriptName) {
                function done(err, moduleValue) {
                    // TODO Handle err ourselves?

                    if (!loadingModules[scriptName]) {
                        return;
                    }

                    var callbacks = loadingModules[scriptName];
                    var callback;
                    loadingModules[scriptName] = NULL;

                    while ((callback = callbacks.pop())) {
                        callback(err, moduleValue);
                    }
                }

                if (err) return done(err, NULL);

                // HACK
                var effectiveConfig2 = clone(effectiveConfig, config.cwd ? { } : { cwd: dirName(scriptName) });

                var ndeps = deps.slice();

                if (COMMONJS_COMPAT) {
                    if (!name && !ndeps.length && typeof callback === 'function' && callback.length) {
                        ndeps.push('require');
                        ndeps.push('exports');
                        ndeps.push('module');
                    }
                }

                loadMany(ndeps, effectiveConfig2, function (err, moduleValues, moduleScripts) {
                    if (err) return done(err, NULL);

                    var moduleValue = context.userCallback(scriptName, callback, moduleValues, moduleScripts);
                    loadedModules[scriptName] = moduleValue;
                    done(NULL, moduleValue);
                });
            }

            var s = activeScript();

            if (s) {
                s.callbacks.push(load);
            } else if (name) {
                var scriptName = getScriptName(name, effectiveConfig);

                queuedModules[scriptName] = function (_, neoConfig) {
                    // TODO use neoConfig
                    load(NULL, scriptName);
                };
            } else {
                throw new Error('Invalid define call');
            }
        }

        function reconfigure(configuration) {
            extend(context, configuration);
        }
    }

    (function () {
        var un;

        // Environment-specific code
        if (ENABLE_BROWSER && typeof window !== 'undefined') {
            var goodResponseCodes = [ 200, 204, 206, 301, 302, 303, 304, 307 ];
            var doc = document;

            un = create({
                loadScriptAsync: function (scriptName, callback) {
                    var script = doc.createElement('script');
                    script.async = true;

                    // Modelled after jQuery (src/ajax/script.js)
                    script.onload = script.onreadystagechange = function () {
                        if (!script.readyState || /loaded|complete/.test(script.readyState)) {
                            // Remove from DOM
                            var parent = script.parentNode;
                            if (parent) {
                                parent.removeChild(script);
                            }

                            // IE likes memleaks
                            script.onload = script.onreadystatechange = NULL;
                            script = NULL;

                            callback(NULL);
                        }
                    };

                    script.onerror = function () {
                        callback(new Error());
                    };

                    // Remember: we need to attach event handlers before
                    // assigning `src`.  Events may be fired as soon as we set
                    // `src`.
                    script.src = scriptName;

                    doc.head.appendChild(script);
                },
                loadScriptSync: function (scriptName) {
                    var scriptSource;

                    try {
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', scriptName, false);
                        xhr.send(NULL);

                        if (goodResponseCodes.indexOf(xhr.status) < 0) {
                            return false;
                        }

                        scriptSource = xhr.responseText;
                        scriptSource += '\n\n//@ sourceURL=' + scriptName;
                    } catch (e) {
                        return false;
                    }

                    // Don't wrap user code in try/catch
                    eval(scriptSource);

                    return true;
                }
            });

            window.require = un.require;
            window.define = un.define;
        } else if (ENABLE_NODEJS && typeof exports !== 'undefined') {
            un = create({
                context: { },
                loadScriptAsync: function (scriptName, callback) {
                    callback(new Error('Error loading module ' + scriptName));
                },
                loadScriptSync: function (scriptName) {
                    var fs = require('fs'); // Node.JS-provided require
                    var vm = require('vm'); // "

                    var code;
                    try {
                        code = fs.readFileSync(scriptName);
                    } catch (e) {
                        // TODO Detect file-not-found errors only
                        return false;
                    }

                    vm.runInNewContext(code, un.context || { }, scriptName);

                    return true;
                }
            });

            exports.require = un.require;
            exports.define = un.define;
            exports.reconfigure = un.reconfigure;
        } else {
            throw new Error('Unsupported environment');
        }
    }());

//@{{{
}());
//@}}}

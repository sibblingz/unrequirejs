(function () {
    var COMPAT = true; // Require.JS compatibility

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

    function hasOwn(obj, name) {
        return hasOwnProperty.call(obj, name);
    }

    function isArray(x) {
        return toString.call(x) === '[object Array]';
    }

    function isPlainOldObject(x) {
        return toString.call(x) === '[object Object]';
    }

    function identity(x) { return x; }

    function extend(base, extension) {
        var key;

        for (key in extension) {
            if (hasOwn(extension, key)) {
                base[key] = extension[key];
            }
        }

        return base;
    }

    var loadScriptAsync, loadScriptSync;
    var userCallback;

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
            } else if (parts[i] === '..') {
                // Go back
                if (newParts.length === 0) {
                    newParts = [ '..' ];
                } else {
                    newParts.pop();
                }
            } else if (parts[i] === '.') {
                // Go here
                if (newParts.length === 0) {
                    newParts = [ '.' ];
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
        baseUrl = pathNormalize(pathSplit(baseUrl || ''));
        parts = pathNormalize(pathSplit(parts));

        if (parts[0] === '..' || parts[0] === '.') {
            // Relative paths are based on cwd
            return pathNormalize(cwd.concat(parts));
        } else if (parts[0] === '') {
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

    function getScriptName(moduleName, config, cwd) {
        var scriptName = pathJoin(pathResolve(cwd, config.baseUrl, moduleName));
        scriptName = scriptName + (/\.js$/i.test(scriptName) ? '' : '.js');
        return scriptName;
    }

    function activeScript() {
        return scriptStack[scriptStack.length - 1];
    }

    function getEffectiveConfig(config) {
        var effectiveConfig = { };
        for (var i = 0; i < scriptStack.length; ++i) {
            extend(effectiveConfig, scriptStack[i].config);
        }
        extend(effectiveConfig, config);
        return effectiveConfig;
    }

    function beginLoading(config) {
        scriptStack.push({
            config: config,
            callbacks: [ ]
        });
    }

    function doneLoading(/* args... */) {
        // Users may dynamically define or require modules in the callback.
        // The config needs to be on this stack, so we must pop *after*
        // processing all callbacks  The config needs to be on this stack, so
        // we must pop *after* processing all callbacks
        var script = activeScript();
        var callback;
        while ((callback = script.callbacks.pop())) {
            callback.apply(null, arguments);
        }
        scriptStack.pop();
    }

    function loadOneSync(scriptName, callback) {
        var loaded = loadScriptSync(scriptName);
        if (loaded) {
            doneLoading(scriptName);
            return true;
        } else {
            return false;
        }
    }

    function loadOneAsync(scriptName) {
        loadScriptAsync(scriptName, function () {
            doneLoading(scriptName);
        });
    }

    function shouldReloadModule(moduleName) {
        return !hasOwn(loadedModules, moduleName) && !hasOwn(loadingModules, moduleName);
    }

    function loadOne(scriptName, callback) {
        if (hasOwn(loadedModules, scriptName)) {
            callback(null, loadedModules[scriptName]);
            return;
        } else if (hasOwn(loadingModules, scriptName)) {
            loadingModules[scriptName].push(callback);
            return;
        }

        beginLoading();

        loadingModules[scriptName] = [ callback ];

        if (!loadOneSync(scriptName)) {
            loadOneAsync(scriptName);
        }
    }

    function loadMany(moduleNames, config, cwd, callback) {
        if (COMPAT) {
            moduleNames.push('require');
            moduleNames.push('exports');
            moduleNames.push('module');
        }

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

                callback(null, moduleValues, moduleScripts);
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
                    var args = reqArgs.apply(null, arguments);
                    var newConfig = args.config;
                    var deps = args.deps;
                    var callback = args.callback;

                    newConfig = extend(extend({ }, config), newConfig);

                    return req(newConfig, deps, callback);
                });
            } else if (moduleName === 'define') {
                loaded(i, function define(/* ... */) {
                    var args = defArgs.apply(null, arguments);
                    var name = args.name;
                    var newConfig = args.config;
                    var deps = args.deps;
                    var callback = args.callback;

                    newConfig = extend(extend({ }, config), newConfig);

                    return def(name, config, deps, callback);
                });
            } else if (COMPAT && moduleName === 'module') {
                loaded(i, { });
            } else if (COMPAT && moduleName === 'exports') {
                // TODO
                loaded(i, { });
            } else {
                var moduleScript = getScriptName(moduleName, config, cwd);
                moduleScripts[i] = moduleScript;

                loadOne(moduleScript, function (err, moduleValue) {
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
            moduleValue = callback.apply(null, moduleValues);
        }

        if (COMPAT) {
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

        var args = reqArgs.apply(null, arguments);
        var config = args.config;
        var deps = args.deps;
        var callback = args.callback;

        var effectiveConfig = getEffectiveConfig(config);

        beginLoading(config);

        // TODO Support cwd for require
        loadMany(deps, effectiveConfig, '', function (err, moduleValues, moduleScripts) {
            if (err) throw err;

            doneLoading();

            userCallback(null, callback, moduleValues, moduleScripts);
        });
    }

    function defArgs(name, config, deps, callback) {
        if (typeof name !== 'string') {
            // Name omitted
            callback = deps;
            deps = config;
            config = name;
            name = null;
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
        var args = defArgs.apply(null, arguments);
        var name = args.name;
        var config = args.config;
        var deps = args.deps;
        var callback = args.callback;

        var effectiveConfig = getEffectiveConfig(config);

        function load(scriptName) {
            loadMany(deps, effectiveConfig, dirName(scriptName), function (err, moduleValues, moduleScripts) {
                function callCallbacks(moduleName, err, moduleValue) {
                    if (!loadingModules[moduleName]) {
                        return;
                    }

                    var callback;
                    var callbacks = loadingModules[moduleName];
                    loadingModules[moduleName] = null;

                    while ((callback = callbacks.pop())) {
                        callback(err, moduleValue);
                    }
                }

                if (err) return callCallbacks(scriptName, err);

                var moduleValue = userCallback(scriptName, callback, moduleValues, moduleScripts);
                loadedModules[scriptName] = moduleValue;
                callCallbacks(scriptName, null, moduleValue);
            });
        }

        var s = activeScript();

        if (s) {
            s.callbacks.push(load);
        } else if (name) {
            load(getScriptName(name, config, effectiveConfig.cwd || ''));
        } else {
            throw new Error('Invalid define call');
        }
    }

    var environment = { };

    function updateEnvironment(env) {
        var oldInit = environment.init;

        extend(environment, env);

        if (oldInit) {
            // FIXME HACK
            oldInit(req, def, environment);
        }

        loadScriptSync = environment.loadScriptSync;
        loadScriptAsync = environment.loadScriptAsync;
        userCallback = environment.userCallback;

        environment.init(req, def, env);
    }

    req.env = updateEnvironment;

    (function () {
        // Environment-specific code

        var goodResponseCodes = [ 200, 204, 206, 301, 302, 303, 304, 307 ];

        var browser = {
            init: function (require, define) {
                window.require = require;
                window.define = define;
            },
            loadScriptAsync: function (scriptName, callback) {
                var script = document.createElement('script');
                script.type = 'text/javascript';
                script.async = true;

                // Modelled after jQuery (src/ajax/script.js)
                script.onload = script.onreadystagechange = function () {
                    if (!script.readyState || /loaded|complete/.test(script.readyState)) {
                        // Remove from DOM
                        if (script.parentNode) {
                            script.parentNode.removeChild(script);
                        }

                        // IE likes memleaks
                        script.onload = script.onreadystatechange = null;
                        script = null;

                        callback(null);
                    }
                };

                script.onerror = function () {
                    callback(new Error());
                };

                script.src = scriptName;

                // TODO Refactor this
                var firstScript = document.getElementsByTagName('script')[0];
                if (firstScript) {
                    firstScript.parentNode.insertBefore(script, firstScript);
                } else {
                    document.head.appendChild(script);
                }
            },
            loadScriptSync: function (scriptName) {
                var scriptSource;

                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', scriptName, false);
                    xhr.send(null);

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
            },
            userCallback: defaultUserCallback
        };

        var context = null;

        var node = {
            init: function (require, define, env) {
                exports.require = require;
                exports.define = define;

                if (env.context) {
                    context = env.context;
                }
            },
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

                vm.runInNewContext(code, context || { }, scriptName);

                return true;
            },
            userCallback: defaultUserCallback
        };

        if (typeof window !== 'undefined') {
            var r = typeof window.require === 'object' ? window.require : { };
            updateEnvironment(extend(browser, r));
        } else if (typeof module !== 'undefined') {
            updateEnvironment(node);
        } else {
            throw new Error('Unsupported environment');
        }
    }());
}());

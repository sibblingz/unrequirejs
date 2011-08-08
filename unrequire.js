(function () {
    if (typeof window !== 'undefined') {
        window.require = {
            init: function (require, define) {
                window.require = require;
                window.define = define;
            },
            loadScriptAsync: function (scriptName, callback) {
                var script = document.createElement('script');
                script.type = 'text/javascript';
                script.async = true;
                script.addEventListener('load', function () {
                    callback(null);
                }, false);

                // TODO Error checking
                // TODO Handle <base>
                // TODO Support other onloaded event types (IE)
                // TODO Clean up properly

                script.src = scriptName;

                var firstScript = document.getElementsByTagName('script')[0];
                if (firstScript) {
                    firstScript.parentNode.insertBefore(script, firstScript);
                } else {
                    head.appendChild(script);
                }
            },
            loadScriptSync: function (scriptName) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', scriptName, false);
                xhr.send(null);

                var scriptSource = xhr.responseText;
                scriptSource += scriptSource + '\n\n//@ sourceURL=' + scriptName;
                eval(scriptSource);
            }
        };
    }
}());

(function () {
    var BROWSER = typeof window !== 'undefined';
    var document = window.document;
    var head = document.head;

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

    if (typeof require !== 'object') {
        throw new Error('Unsupported environment');
    }

    var loadScriptAsync = require.loadScriptAsync;
    var loadScriptSync = require.loadScriptSync;

    function subscribeModuleLoaded(moduleName, callback) {
        if (hasOwn(loadedModules, moduleName)) {
            callback(null, loadedModules[moduleName]);
        } else if (hasOwn(loadingModules, moduleName)) {
            loadingModules[moduleName].push(callback);
        } else {
            loadingModules[moduleName] = [ callback ];
        }
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
        } else {
            // Absolute paths are based on baseUrl
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

    function doneLoadingOne(args) {
        var script = scriptStack.pop();
        var callback;
        while ((callback = script.callbacks.pop())) {
            callback.apply(null, args);
        }
    }

    function loadOneSync(scriptName, callback) {
        if (!hasOwn(loadedModules, scriptName)) {
            loadScriptSync(scriptName);
            doneLoadingOne([ scriptName ]);
        }
    }

    function loadOneAsync(scriptName, callback) {
        if (!hasOwn(loadedModules, scriptName)) {
            loadScriptAsync(scriptName, function () {
                doneLoadingOne([ scriptName ]);
            });
        }
    }

    function loadOne(scriptName, callback) {
        try {
            loadOneSync(scriptName);
        } catch (e) {
            loadOneAsync(scriptName);
        }

        subscribeModuleLoaded(scriptName, callback);
    }

    function loadMany(moduleNames, config, cwd, callback) {
        var moduleValues = [ ];
        var loadCount = 0;
        var callbackCalled = false;

        function check() {
            if (loadCount >= moduleNames.length) {
                if (callbackCalled) {
                    return;
                }

                callbackCalled = true;

                callback(null, moduleValues);
            }
        }

        function load(i) {
            loadOne(getScriptName(moduleNames[i], config, cwd), function (err, moduleValue) {
                if (err) return callback(err);

                moduleValues[i] = moduleValue;
                ++loadCount;

                check();
            });
        }

        var i;

        for (i = 0; i < moduleNames.length; ++i) {
            load(i);
        }

        check();
    }

    function req(config, deps, callback) {
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

        scriptStack.push({
            config: config,
            callbacks: [ ]
        });

        // TODO Support cwd for require
        loadMany(deps, config, '', function (err, moduleValues) {
            if (err) throw err;

            if (callback) {
                callback.apply(null, moduleValues.concat([ /* TODO */ ]));
            }
        });
    }

    function def(name, config, deps, callback) {
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

        // Get effective config
        var effectiveConfig = { };
        for (var i = 0; i < scriptStack.length; ++i) {
            extend(effectiveConfig, scriptStack[i].config);
        }
        extend(effectiveConfig, config);

        function load(scriptName) {
            loadMany(deps, effectiveConfig, dirName(scriptName), function (err, moduleValues) {
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

                var moduleValue = callback.apply(null, moduleValues.concat([ /* TODO */ ]));

                loadedModules[scriptName] = moduleValue;

                callCallbacks(scriptName, null, moduleValue);
            });
        }

        scriptStack.push({
            config: config,
            callbacks: [ load ]
        });
    } 

    require.init(req, def);
}());

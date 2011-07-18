(function (undefined) {
    var BROWSER = typeof window !== 'undefined';
    var document = window.document;
    var head = document.head;

    var queuedModules = { };
    var loadedModules = { };
    var loadingModules = { };

    var defineHandlers = [ ];

    var nextTick = function (callback) {
        // TODO feature-detect better methods
        setTimeout(callback, 0);
    };

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

    function subscribeModuleLoaded(moduleName, callback) {
        if (hasOwn(loadedModules, moduleName)) {
            nextTick(function () {
                callback(null, loadedModules[moduleName]);
            });
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

    function pathJoin(cwd, parts) {
        // TODO rewrite (seriously)
        cwd = pathSplit(cwd);
        parts = pathSplit(parts);

        var newParts = [ ];
        var i;
        var isRelative = false;

        for (i = 0; i < parts.length; ++i) {
            if (!parts[i]) {
                // Root
                newParts = [ ];
                isRelative = false;
            } else if (parts[i] === '..') {
                isRelative = newParts.length === 0;

                if (isRelative) {
                    newParts = [ '..' ];
                } else {
                    newParts.pop();
                }
            } else if (parts[i] === '.') {
                isRelative = newParts.length === 0;

                if (isRelative) {
                    newParts = [ '.' ];
                }
            } else {
                newParts.push(parts[i]);
            }
        }

        if (isRelative) {
            newParts = [ pathJoin([ ], cwd) ].concat(newParts);
        }

        var path = newParts.join('/');
        path = path.replace(/\/+/g, '/');
        return path;
    }

    function dirName(path) {
        var parts = path.split(/\//g);
        parts = parts.slice(0, parts.length - 1);
        return pathJoin([ ], parts);
    }

    function getScriptName(moduleName, config, cwd) {
        var scriptName = pathJoin(cwd, [ moduleName ]);
        scriptName = scriptName + (/\.js$/i.test(scriptName) ? '' : '.js');
        return scriptName;
    }

    function loadOneAsync(scriptName, callback) {
        subscribeModuleLoaded(scriptName, callback);

        loadScriptAsync(scriptName, identity);
    }

    function loadManyAsync(moduleNames, config, cwd, callback) {
        var moduleValues = [ ];
        var loadCount = 0;

        function check() {
            if (loadCount >= moduleNames.length) {
                callback(null, moduleValues);
            }
        }

        function load(i) {
            loadOneAsync(getScriptName(moduleNames[i], config, cwd), function (err, moduleValue) {
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

    function require(config, deps, callback) {
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

        // TODO Support cwd for require
        loadManyAsync(deps, config, '', function (err, moduleValues) {
            if (err) throw err;

            callback.apply(null, moduleValues.concat([ /* TODO */ ]));
        });
    }

    function define(name, config, deps, callback) {
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

        function load(scriptName) {
            loadManyAsync(deps, config, dirName(scriptName), function (err, moduleValues) {
                function callCallbacks(moduleName, err, moduleValue) {
                    if (!loadingModules[moduleName]) {
                        return;
                    }

                    var callback;

                    while ((callback = loadingModules[moduleName].pop())) {
                        callback(err, moduleValue);
                    }

                    loadingModules[moduleName] = null;
                }

                if (err) return callCallbacks(scriptName, err);

                var moduleValue = callback.apply(null, moduleValues.concat([ /* TODO */ ]));

                loadedModules[scriptName] = moduleValue;

                callCallbacks(scriptName, null, moduleValue);
            });
        }

        defineHandlers.push(load);
    } 

    var loadScriptAsync;

    if (BROWSER) {
        loadScriptAsync = function (scriptName, callback) {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.async = 'async';
            script.addEventListener('load', function () {
                var defineCallback;

                while ((defineCallback = defineHandlers.pop())) {
                    defineCallback(scriptName, 'TODO CONTEXT');
                }

                callback(null);
            }, false);

            // TODO Error checking
            // TODO Handle <base>
            // TODO Support other onloaded event types (IE)
            // TODO Clean up properly

            script.src = scriptName;
            head.appendChild(script);
        };

        window.require = require;
        window.define = define;
    } else {
        throw new Error('Unsupported environment');
    }
}());

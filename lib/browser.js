unrequire['definePlugin'](function (un) {
    var document = window.document;

    var IS_OPERA = Object.prototype.toString.call(window.opera) === '[object Opera]';
    var IS_IE = document.all && !IS_OPERA;

    // MIT: http://trac.webkit.org/wiki/DetectingWebKit
    var IS_WEBKIT = typeof navigator !== 'undefined' && navigator && / AppleWebKit\//.test(navigator.userAgent);

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

    function handleDefine(args, config) {
        var moduleName = un['normalizeRawName'](args['name'], config);
        un['announce'](moduleName, function () {
            un['execute'](args['deps'], config, args['factory'], function (errs, value) {
                if (errs) throw errs;

                un['push'](moduleName, value);
            });
        });
    }

    function flushDefineQueue(queue, requestName, config) {
        var args;
        while ((args = queue.shift())) {
            if (args.name === null) {
                args.name = requestName;
            }

            handleDefine(args, config);
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
        if (loadScriptSync(scriptName)) {
            callback(null);
            return;
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
        un['execute'](args['deps'], globalConfiguration, args['factory'], function (errs, value) {
            if (errs) throw errs;
        });
    }
    globalRequire['definePackage'] = function definePackage(rawPackageName, rawModuleNames) {
        un['definePackage'](rawPackageName, rawModuleNames, globalConfiguration);
    };

    // TODO Rename to unrequire and have unrequire.load
    window['require'] = globalRequire;

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

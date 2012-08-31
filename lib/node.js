if (typeof module !== 'undefined' && typeof exports !== 'undefined' && typeof require === 'function') {

var nodeRequire = require;
var unrequire = nodeRequire('./unrequire.js');

unrequire.definePlugin("node", function (un) {
    var path = nodeRequire('path');
    var vm = nodeRequire('vm');
    var fs = nodeRequire('fs');

    var parseUri = un['parseUri'];
    var buildUri = un['buildUri'];

    var globalConfiguration = un['createDefaultConfiguration']();
    var baseUrl = path.dirname(process.argv[1]);
    globalConfiguration['baseUrl'] = baseUrl;
    globalConfiguration['cwd'] = baseUrl;

    // defineQueue :: [DefineArguments]
    var defineQueue = [ ];

    function define() {
        defineQueue.push(un['parseDefineArguments'](arguments));
    }

    exports.onerror = null;

    function checkError(err) {
        if (err) {
            var onerror = exports.onerror;
            if (typeof onerror === 'function') {
                onerror(err);
            } else {
                throw err;
            }
        }
    }

    function flushDefineQueue(queue, requestName, config) {
        var args;
        while ((args = queue.shift())) {
            if (args.name === null) {
                args.name = requestName;
            }

            un['handleDefine'](args, config, checkError);
        }
    }

    function globalRequire() {
        var args = un['parseRequireArguments'](arguments);
        un['handleRequire'](args, globalConfiguration, checkError);
    }

    exports.require = globalRequire;

    exports.context = vm.createContext();
    exports.context.define = define;
    exports.context.require = globalRequire;

    return {
        // getResourceID :: ModuleName -> Maybe ResourceID
        'getResourceID': function getResourceID(moduleName) {
            var uri = parseUri(moduleName);
            var extensions = uri['file'].split('.').slice(1);
            var p = uri['path'];
            if (!extensions.length) {
                // No extension implies .js.
                p += '.js';
            } else if (extensions[extensions.length - 1] !== 'js') {
                // Not a .js file.
                return null;
            }

            var newModuleName = buildUri(
                uri['protocol'],
                uri['authority'],
                p,
                uri.query
                /* no anchor */
            );

            return path.normalize(newModuleName);
        },

        // request :: RequestName -> Configuration -> IO (Maybe Error,IO [Announce])
        'request': function request(requestName, config, callback) {
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
        },

        // fetchResource
        //   :: ResourceID
        //   -> Configuration
        //   -> Callback ()
        //   -> IO ()
        'fetchResource': function fetchResource(scriptName, config, callback) {
            // Change directory of sub-config, so relative paths are based on
            // the module's path.
            var scriptUri = parseUri(scriptName);
            var newCwd = buildUri(
                scriptUri['protocol'],
                scriptUri['authority'],
                scriptUri['directory']
                /* no query, no anchor */
            ).replace(/\/+$/, '');  // .replace is a HACK
            config = un['joinConfigurations'](config, { }); // HACK to clone config
            config['cwd'] = newCwd;

            fs.readFile(scriptName, 'utf8', function (err, codeText) {
                if (err) {
                    checkError(err);
                    return;
                }

                // HACK to get better syntax error messages.
                try {
                    eval("(function(){{" + codeText + "}}())");
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        var message = e.message + " in " + scriptName + " (error may be inaccurate)";
                        checkError(new SyntaxError(message));
                        return;
                    }
                }

                vm.runInContext(codeText, exports.context, scriptName);
                flushDefineQueue(defineQueue, scriptName, config);
                callback(null);
            });
        },

        // extractModule :: Object -> ModuleName -> Callback Object -> IO ()
        'extractModule': function extractModule(object, moduleName, callback) {
            callback(null, object);
        }
    };
});

}

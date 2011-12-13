var nodeRequire = require;
var unrequire = nodeRequire('./unrequire.js');
unrequire.definePlugin(function (un) {
    var path = nodeRequire('path');
    var vm = nodeRequire('vm');
    var fs = nodeRequire('fs');

    function handleDefine(args, config) {
        var moduleName = un['normalizeRawName'](args['name'], config);
        un['announce'](moduleName, function () {
            un['execute'](args['deps'], config, args['factory'], function (errs, value) {
                if (errs) throw errs;

                un['push'](moduleName, value);
            });
        });
    }

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
                    handleDefine(args, config);
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

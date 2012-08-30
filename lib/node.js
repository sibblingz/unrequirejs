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

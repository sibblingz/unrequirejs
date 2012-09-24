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
            if (typeof factory !== 'function') {
                return next.apply(this, arguments);
            }

            var commonJSModule = !moduleCount && factory.length === 3;

            if (commonJSModule || (moduleCount >= 1 && modulePairs[0][0] === NAME_REQUIRE)) {
                var partialArgs = [ makeRequire(config) ];
                var modulesConsumed = 1;

                if (commonJSModule || (moduleCount >= 3
                 && modulePairs[1][0] === NAME_EXPORTS
                 && modulePairs[2][0] === NAME_MODULE)
                ) {
                    var exports = { };
                    var module = { 'exports': exports };
                    partialArgs.push(exports, module);
                    modulesConsumed = 3;

                    if (commonJSModule) {
                        factory.apply(null, partialArgs);
                        next = function () { };
                    }

                    callback(null, exports);
                    callback = function () { }; // TODO Error checking
                }

                factory = partialA(factory, partialArgs);
                modulePairs = modulePairs.slice(modulesConsumed);
            }

            next(modulePairs, config, factory, callback);
        }
    };
});

unrequire.definePlugin(function (un) {
    var goodResponseCodes = [ 200, 204, 206, 301, 302, 303, 304, 307 ];
    var doc = window.document;

    var onreadystatechange = 'onreadystatechange';
    var onload = 'onload';
    var onerror = 'onerror';

    function loadScript(scriptName, callback) {
        var script = doc.createElement('script');
        script.async = true;

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

        script[onerror] = function () {
            callback(new Error('Failed to load script'));
        };

        // Remember: we need to attach event handlers before
        // assigning `src`.  Events may be fired as soon as we set
        // `src`.
        script.src = scriptName;

        doc['head'].appendChild(script);
    }

    function define() {
        //var args = un.parseDefineArguments(arguments);
        var args = {
            name: arguments[0],
            deps: arguments[1],
            callback: arguments[2]
        };
        var moduleName = un.resolveRawName(args.name);
        un.announce(moduleName, function () {
            un.execute(args.deps, args.callback, function (errs, value) {
                if (errs) throw errs;

                un.push(moduleName, value);
            });
        });
    }

    function globalRequire() {
        //var args = un.parseRequireArguments(arguments);
        var args = {
            deps: arguments[0],
            callback: arguments[1]
        };
        un.execute(args.deps, args.callback, function (errs, value) {
            if (errs) throw errs;
        });
    }

    window.require = globalRequire;

    return {
        // resolve :: ModuleName -> RequestName
        resolve: function resolve(moduleName) {
            var filename = moduleName.split('/').slice(-1)[0];
            if (!/(\.js)?$/i.test(filename)) {
                // Not a .js file; don't handle
                return false;
            }

            if (!/\.js$/i.test(filename)) {
                moduleName += '.js';
            }

            return moduleName;
        },

        // request :: RequestName -> IO (Maybe Error,IO [Announce])
        request: function request(requestName, callback) {
            window.define = define;
            loadScript(requestName, callback);
        }
    };
});

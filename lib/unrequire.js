// NOTE: Lines between and including those with
// @{{{ and @}}}
// will be removed upon compilation.
// Lines with @ in them should be handled with care.
//
// NOTE: unrequire is meant to be build by prefixing
//     var unrequire =
// so don't put any weird stuff before the closure.

(function () {
    // To embed in-line without pollution:
    //
    // function unrequire() {
    //     var window = { };
    //     /* unrequire sources */
    //     return window.unrequire;
    // }

    // Feature flags
    // (overwritten by build system)
//@{{{
    var LOGGING = false;
//@}}}

    // Note: The Haskell type annotations are (obviously)
    // not 100% accurate (and may hide some things), but it
    // helps in understanding the flow of e.g. module
    // identifier types.

    if (LOGGING) {
        var log = console.log.bind(console);
    }

    // {{{ Data types

    // A user representation of a module name within some
    // configuration context.  Must be normalized to a
    // ModuleName before use.
    // type RawName = String

    // The name of a module, which may be contained within a
    // resource.
    // type ModuleName = String

    // The name of a resource, which can be cached.  Can
    // contain one or more modules.
    // type ResourceID = String

    // A ResourceID coupled with its plugin.
    // data ResourceHandle plugin = ResourceHandle ResourceID
    function ResourceHandle(id, plugin) {
        this.id = id;
        this.plugin = plugin;
    }

    // type ResourceValue a = Object

    // class Plugin a where
    //   getResourceID :: ModuleName -> Maybe ResourceID
    //   fetchResource :: ResourceID -> Configuration -> Errorback -> IO ()
    //   extractModule :: ResourceValue a -> ModuleName -> Callback Object -> IO ()

    // }}} Data types

    // {{{ JavaScript plumbing

    var min = Math.min;

    var object = { }; // Shortcut to get access to Object.prototype

    function call(fn) { return fn(); }

    function hasOwn(obj, property) {
        return object.hasOwnProperty.call(obj, property);
    }

    function isPlainOldObject(x) {
        return object.toString.call(x) === '[object Object]';
    }

    function map(array, fn) {
        return array.map(fn);
    }

    function zip(arrays) {
        var minLength = min.apply(Math, map(arrays, function (xs) {
            return xs.length;
        }));

        var out = [ ];
        var i;
        for (i = 0; i < minLength; ++i) {
            out.push(map(arrays, function (xs) {
                return xs[i];
            }));
        }

        return out;
    }

    function isArray(x) {
        return Array.isArray(x);
    }

    function callbackMany(functions, doneCallback) {
        // If calls are made:
        //
        // callback(null, 42);
        // callback(null, 'hello world');
        // callback(new Error("Request failed"));
        // callback(null, undefined);
        //
        // argumentSets looks like:
        //
        // [
        //     new Error("Request failed"),
        //     [ 42, 'hello world', undefined, null ]
        // ]

        var argumentSets = [ ];
        var callCount = 0;
        var called = false;

        function check() {
            if (!called && callCount === functions.length) {
                called = true;
                argumentSets[0] = getErrors(argumentSets[0]);
                doneCallback.apply(null, argumentSets);
            }
        }

        function call(i) {
            functions[i].call(null, function () {
                var j;
                for (j = 0; j < arguments.length; ++j) {
                    if (!argumentSets[j]) {
                        argumentSets[j] = [ ];
                    }

                    argumentSets[j][i] = arguments[j];
                }

                ++callCount;
                check();
            });
        }

        var i;
        for (i = 0; i < functions.length; ++i) {
            call(i);
        }

        check(); // In case we have zero functions
    }

    // }}} JavaScript plumbing

    // {{{ parseUri

    // parseUri 1.2.2
    // (c) Steven Levithan <stevenlevithan.com>
    // MIT License
    // Modified by Matt Glazar <matt@spaceport.io>

    var parseUriRegExp = /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/;
    var parseUriKeys = 'source,protocol,authority,userInfo,user,password,host,port,relative,path,directory,file,query,anchor'.split(',');
    var parseUriQueryRegExp = /(?:^|&)([^&=]*)=?([^&]*)/g;

    function parseUri(str) {
        var match = parseUriRegExp.exec(str);
        var uri = { };
        var i = 14;
        while (i--) {
            uri[parseUriKeys[i]] = match[i] || '';
        }

        var query = { };
        uri['queryKey'] = query;
        uri[parseUriKeys[12]].replace(parseUriQueryRegExp, function ($0, $1, $2) {
            if ($1) {
                query[$1] = $2;
            }
        });

        return uri;
    }

    // }}} parseURI

    function buildUri(protocol, authority, path, query, anchor) {
        return [
            protocol && protocol + ':',
            authority && '//' + authority,
            path && path,
            query && '?' + query,
            anchor && '#' + anchor
        ].join('');
    }

    // plugins :: [Plugin]
    var plugins = [ ];

    function pathJoin(root, cd) {
        if (root) {
            return root + '/' + cd;
        } else {
            return cd;
        }
    }

    // normalizeRawName :: RawName -> Configuration -> ModuleName
    function normalizeRawName(rawName, config) {
        if (/^\.\.?(\/|$)/.test(rawName)) {
            // Explicitly relative URL; base off of cwd.
            return pathJoin(config['cwd'], rawName);
        }

        var uri = parseUri(rawName);
        var p = uri['path'];
        if (!uri['protocol'] && !uri['authority'] && !/^[\/\\]/.test(p)) {
            // Relative (without host or /) path; base off of baseUrl.
            return pathJoin(config['baseUrl'], buildUri(
                null,  // protocol
                null,  // authority
                p,     // path
                uri['query'],
                uri['anchor']
            ));
        }

        // Absolute path; don't change.
        return rawName;
    }

    // normalizeRawName :: [RawName] -> Configuration -> ModuleName
    function normalizeRawNames(rawNames, config) {
        return map(rawNames, function (rawName) {
            return normalizeRawName(rawName, config);
        });
    }

    // getResourceHandle :: ModuleName -> IO (ResourceHandle _)
    function getResourceHandle(moduleName) {
        // fromJust . msum . map getResourceHandle
        var i;
        for (i = 0; i < plugins.length; ++i) {
            var plugin = plugins[i];
            var id = plugin['getResourceID'](moduleName);
            if (id !== null) {
                return new ResourceHandle(id, plugin);
            }
        }

        throw new Error("No suitable plugin can handle module: " + moduleName);
    }

    // A mapping from from a resource to its announcer.
    // When an announcer is called (i.e. when a resource is
    // pulled), it may push a value.
    // announces :: Map ResourceID (IO ())
    var announces = { };

    // The set of all resources which have had its
    // announcer called.
    // announced :: [ResourceID]
    var announced = [ ];

    // The value of each pushed resource.
    // pushedValues :: Map ResourceID (ResourceValue _)
    var pushedValues = { };

    // Functions to be called when a resource is pushed.
    // pullingFunctions :: Map ResourceID (Callback (ResourceValue _))
    var pullingFunctions = { };

    // requestedResources :: Map ResourceID ()
    var requestedResources = { };

    // Dependency graph {{{

    // dependencyGraph :: Map ResourceID [ResourceID]
    var dependencyGraph = { };

    // addDependency :: ModuleName -> ResourceID -> IO ()
    function addDependency(from, to) {
        if (hasOwn(dependencyGraph, from)) {
            dependencyGraph[from].push(to);
        } else {
            dependencyGraph[from] = [ to ];
        }
    }

    // Finds strongly-connected components in a directed
    // graph of strings.
    // scc :: Map String [String] -> [[String]]
    function scc(graph) {
        var vertexIndices = { };
        var vertexLowLinks = { };

        var index = 0;
        var stack = [ ];

        var sccs = [ ];

        function strongConnect(v) {
            vertexIndices[v] = index;
            vertexLowLinks[v] = index;
            ++index;
            stack.push(v);

            if (hasOwn(graph, v)) {
                graph[v].forEach(function (w) {
                    if (!hasOwn(vertexIndices, w)) {
                        strongConnect(w);
                        vertexLowLinks[v] = min(vertexLowLinks[v], vertexLowLinks[w]);
                    } else if (stack.indexOf(w) >= 0) {
                        vertexLowLinks[v] = min(vertexLowLinks[v], vertexIndices[w]);
                    }
                });
            }

            if (vertexLowLinks[v] === vertexIndices[v]) {
                var scc = [ ];
                var w;
                do {
                    w = stack.pop();
                    scc.push(w);
                } while (w !== v);
                sccs.push(scc);
            }
        }

        Object.keys(graph).forEach(function (vertex) {
            if (!hasOwn(vertexIndices, vertex)) {
                strongConnect(vertex);
            }
        });

        return sccs;
    }

    // getCircularDependencies :: IO [[ResourceID]]
    function getCircularDependencies() {
        var sccs = scc(dependencyGraph);
        return sccs.filter(function (scc) {
            return scc.length > 1;
        });
    }

    // Prints error messages for each resource dependency
    // cycle.
    // checkCycles :: IO ()
    function checkCycles() {
        var cycles = getCircularDependencies();
        cycles.forEach(function (cycle) {
            if (cycle.length === 1) {
                return;
            }

            if (cycle.every(hasOwn.bind(null, pushedValues))) {
                // Ignore cycles if they have already been resolved
                return;
            }

            console.error("Circular dependency detected between the following modules:\n" + cycle.join("\n"));
        });
    }

    // }}} Dependency graph

    // needsRequest :: ResourceID -> IO Bool
    function needsRequest(resourceID) {
        return !hasOwn(pushedValues, resourceID)
            && !hasOwn(announces, resourceID)
            && announced.indexOf(resourceID) < 0
            && !hasOwn(requestedResources, resourceID);
    }

    // Report that a resource has the given value.
    // push :: ResourceID -> ResourceValue -> IO ()
    function push(resourceID, value) {
        if (hasOwn(pushedValues, resourceID)) {
            throw new Error("Cannot push to " + resourceID + " which already has value " + pushedValues[resourceID]);
        }

        if (LOGGING) {
            log("Pushing module " + resourceID + " with value " + value);
        }

        pushedValues[resourceID] = value;

        if (hasOwn(pullingFunctions, resourceID)) {
            var functions = pullingFunctions[resourceID];
            delete pullingFunctions[resourceID];
            map(functions, function (fn) {
                fn(null, value);
            });
        }
    }

    // Wait for a resource to be pushed a value, and call
    // the callback when it is.
    // pull :: ResourceID -> Callback (ResourceValue _) -> IO ()
    function pull(resourceID, callback) {
        if (LOGGING) {
            log("Pulling module " + resourceID);
        }

        if (hasOwn(pushedValues, resourceID)) {
            callback(null, pushedValues[resourceID]);
        } else {
            if (!hasOwn(pullingFunctions, resourceID)) {
                pullingFunctions[resourceID] = [ ];
            }
            pullingFunctions[resourceID].push(callback);

            if (hasOwn(announces, resourceID) && announced.indexOf(resourceID) < 0) {
                announced.push(resourceID);
                var announce = announces[resourceID];
                //delete announces[resourceID];
                // FIXME Should this be here?
                announce();
            }
        }
    }

    // Convenience function.
    // pullMany :: [ResourceID] -> Callback [ResourceValue _] -> IO ()
    function pullMany(resourceIDs, callback) {
        var pullFunctions = map(resourceIDs, function (resourceID) {
            return function (callback) {
                return pull(resourceID, callback);
            };
        });
        callbackMany(pullFunctions, callback);
    }

    // announce :: ResourceID -> NullCallback -> IO ()
    function announce(resourceID, callback) {
        if (hasOwn(announces, resourceID)) {
            throw new Error("Resource " + resourceID + " already announced");
        } else {
            if (LOGGING) {
                log("Announcing resource " + resourceID);
            }
        }

        if (hasOwn(pullingFunctions, resourceID)) {
            announced.push(resourceID);
            callback();
        } else {
            announces[resourceID] = callback;
        }
    }

    // getErrors :: Maybe [Maybe Error] -> Maybe [Maybe Error]
    function getErrors(errs) {
        var errorReported = false;
        if (errs) {
            map(errs, function (err) {
                if (err) {
                    errorReported = true;
                }
            });
        }

        if (errorReported) {
            return errs;
        } else {
            //return undefined;
        }
    }

    // define([name,] [deps,] [factory])
    // parseDefineArguments :: [Object] -> DefineArgs
    function parseDefineArguments(args) {
        // Note: args may be an arguments object

        var name = null;
        var config = { };
        var deps = [ ];
        var factoryIndex = min(args.length - 1, 2);
        var factory = args[factoryIndex];

        var i = 0;
        if (i < factoryIndex && typeof args[i] === 'string') {
            name = args[i++];
        }
        if (i < factoryIndex && isArray(args[i])) {
            deps = args[i++].slice();
        }

        return {
            'name': name,
            'config': config,
            'deps': deps,
            'factory': factory
        };
    }

    // require([config,] [deps,] [factory])
    // parseRequireArguments :: [Object] -> RequireArgs
    function parseRequireArguments(args) {
        // Note: args may be an arguments object

        var config = { };
        var deps = [ ];
        var factory = null;

        var i = 0;
        if (isPlainOldObject(args[i])) {
            config = args[i++];
        }
        if (isArray(args[i])) {
            deps = args[i++].slice();
        }
        factory = args[i];

        return {
            'config': config,
            'deps': deps,
            'factory': factory
        };
    }

    // createDefaultConfiguration :: Configuration
    function createDefaultConfiguration() {
        return {
            'baseUrl': '',
            'cwd': '.'
        };
    }

    // joinConfigurations :: Configuration -> PartialConfiguration -> Configuration
    function joinConfigurations(left, right) {
        // TODO
        var cwd = left['cwd'];
        if (right['cwd']) {
            // FIXME Not very robust
            cwd += '/' + right['cwd'];
        }

        var baseUrl = left['baseUrl'];
        if (right['baseUrl']) {
            baseUrl = right['baseUrl'];
        }

        return {
            'cwd': cwd,
            'baseUrl': baseUrl
        };
    }

    // definePlugin
    //   :: (Plugin p)
    //   => String
    //   -> p | (Unrequire -> IO p)
    //   -> IO ()
    function definePlugin(name, plugin) {
        if (typeof plugin === 'function') {
            plugin = plugin(api);
        }
        plugins.push(plugin);
    }

    // loadResources
    //   :: [ResourceHandle]  -- ^ Resources to load.
    //   -> Configuration
    //   -> Callback [Object]
    //   -> IO ()
    function loadResources(resourceHandles, config, callback) {
        var loadCallbacks = map(resourceHandles, function (handle) {
            return function (callback) {
                pull(handle.id, callback);
                if (needsRequest(handle.id)) {
                    if (LOGGING) {
                        log("Requesting " + handle.id);
                    }

                    requestedResources[handle.id] = true;
                    handle.plugin['fetchResource'](handle.id, config, function (err) {
                        if (err) return callback(err);
                    });
                }
            }
        });

        callbackMany(loadCallbacks, function (err, resourceValues) {
            callback(err, resourceValues || [ ]);
        });
    }

    // extractModules
    //   :: [ResourceValue, ResourceHandle, ModuleName]
    //   -> Callback [Object]
    //   -> IO ()
    function extractModules(argss, callback) {
        var extractCallbacks = map(argss, function (args) {
            return function (callback) {
                args[1].plugin['extractModule'](
                    args[0],
                    args[2],
                    callback
                );
            };
        });

        callbackMany(extractCallbacks, function (err, moduleValues) {
            callback(err, moduleValues || [ ]);
        });
    }

    function handleDefine(args, config, callback) {
        config = joinConfigurations(config, args['config']);

        var moduleName = normalizeRawName(args['name'], config);
        var resourceHandle = getResourceHandle(moduleName);

        if (LOGGING) {
            log("Define " + resourceHandle.id + " " + JSON.stringify(args));
        }

        var factory = args['factory'];
        var deps = args['deps'];

        announce(resourceHandle.id, function () {
            var depModuleNames = normalizeRawNames(deps, config);
            var depResourceHandles = map(depModuleNames, getResourceHandle);
            depResourceHandles.forEach(function (depResourceHandle) {
                addDependency(resourceHandle.id, depResourceHandle.id);
            });
            checkCycles();

            loadResources(depResourceHandles, config, function on_loadedResources(err, resourceValues) {
                if (err) return callback(err);

                extractModules(zip([
                    resourceValues,
                    depResourceHandles,
                    depModuleNames
                ]), function (err, moduleValues) {
                    if (err) return callback(err);

                    var value = typeof factory === 'function'
                        ? factory.apply(null, moduleValues)
                        : factory;
                    push(resourceHandle.id, value);
                    callback(null);
                });
            });
        });
    }

    function handleRequire(args, config, callback) {
        config = joinConfigurations(config, args['config']);

        if (LOGGING) {
            log("Require " + JSON.stringify(args));
        }

        var factory = args['factory'];

        var moduleNames = normalizeRawNames(args['deps'], config);
        var resourceHandles = map(moduleNames, getResourceHandle);

        loadResources(resourceHandles, config, function on_loadedResources(err, resourceValues) {
            if (err) return callback(err);

            extractModules(zip([
                resourceValues,
                resourceHandles,
                moduleNames
            ]), function (err, moduleValues) {
                if (err) return callback(err);

                if (typeof factory === 'function') {
                    factory.apply(null, moduleValues);
                }
                callback(null);
            });
        });
    }

    var api = {
        'definePlugin': definePlugin,

        'parseUri': parseUri,
        'buildUri': buildUri,

        'push': push,
        'pull': pull,
        'announce': announce,

        'parseDefineArguments': parseDefineArguments,
        'parseRequireArguments': parseRequireArguments,

        'createDefaultConfiguration': createDefaultConfiguration,
        'joinConfigurations': joinConfigurations,

        'handleDefine': handleDefine,
        'handleRequire': handleRequire
    };

    if (typeof this === 'object' && this) {
        // Browsers
        this['unrequire'] = api;
    } else if (typeof module === 'object' && module) {
        // Node.JS
        module['exports'] = api;
    }

    return api;
}());

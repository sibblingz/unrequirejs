#!/usr/bin/env node

// Example build.json
var buildJsonExample = {
    "packages": [
        {
            "modules": [ "a.js", "b", "c.png" ],
            "unrequire": true,
            "outputFile": "main.min.js",
        },
        {
            "modules": [ "extras/a.js" ],
            "unrequire": false, // Optional
            "outputFile": "extras.min.js"
        }
    ],
    "config": {
        "baseUrl": ".",
        "cwd": "."
    },
    "plugins": {
        "build": [ "browser-img" ], // JavaScript and catch-all plugins assumed
        "runtime": [ "browser", "node" ],
        "path": [ "./my/plugin/path" ] // {unrequire}/lib assumed
    }
};

var path = require('path');
var fs = require('fs');

var END_SCRIPT = '\n//*/\n';
var SAFE_UNREQUIRE_PATH = path.join(__dirname, '..', 'lib', 'unrequire.js');

var optimist = require('optimist')
    .usage(
        'Usage: $0 [options] build.json\n' +
        '  Compiles an Unrequire.JS project into one or several script package files'
    )
    .wrap(80)
    .describe({
        'base-url':       'Specify baseUrl require option',
        'output-dir':     'Write output files to the specified directory',
        'unrequire-file': 'Path to the Unrequire implementation to include'
    })
    .string([ 'config', 'base-url', 'unrequire-file', 'output-dir' ])
    .boolean([ 'advanced' ])
    .default({
        'unrequire-file': SAFE_UNREQUIRE_PATH,
        'output-dir': process.cwd(),
    });

var args = optimist.argv;

if (!args._.length) {
    optimist.showHelp();
    process.exit(1);
}

var outputUnrequireFile = args['unrequire-file'];
var outputDir = args['output-dir'];

var unrequire = require(SAFE_UNREQUIRE_PATH);

var buildConfig = JSON.parse(fs.readFileSync(args._[0], 'utf8'));

var buildUnConfig = buildConfig.config || { };
if (args['base-url']) {
    buildUnConfig.baseUrl = args['base-url'];
}

/*
var buildPlugins = (buildConfig.plugins && buildConfig.plugins.build) || [ ];
var buildPluginsPath = (buildConfig.plugins && buildConfig.plugins.path) || [ ];

function findFile(filename, searchPaths) {
    var i;
    for (i = 0; i < searchPaths.length; ++i) {
        var curFilename = path.resolve(searchPaths[i], pluginName);
        console.log('checking', curFilename);
        if (path.existsSync(curFilename)) {
            return curFilename;
        }
    }
    if (path.existsSync(filename)) {
        return filename;
    }
    return null;
}

buildPlugins.forEach(function (pluginName) {
    if (!/\.js$/.test(pluginName)) {
        // Require .js extension
        pluginName += '.js';
    }

    var pluginFilename = findFile(pluginName, buildPluginsPath);
    if (pluginFilename === null) {
        throw new Error("Could not find plugin: " + pluginName);
    }

    require(pluginFilename);
});
*/

unrequire.definePlugin(function (un) {
    // JavaScript build plugin
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
            //var newCwd = requestName.replace(/\/[^\/]+$/, '');
            //config = un['joinConfigurations'](config, { }); // HACK to clone config
            //config['cwd'] = newCwd;

            // TODO Async read
            // TODO Error handling

            var scriptName = path.resolve(config.baseUrl, requestName);
            var code = fs.readFileSync(scriptName, 'utf8');

            var rewritten = rewriteUnrequireCalls(code, scriptName, config);
            code = rewritten.code;

            var functions = {
                'define': function define() {
                    var args = un.parseDefineArguments(arguments);
                    // TODO cwd crap?
                    if (!args.name) {
                        args.name = requestName;
                    }

                    var moduleName = un.normalizeRawName(args.name, config);
                    un.announce(moduleName, function () {
                        un.load(args.deps, config, function (errs, _) {
                            var errorReported = false;
                            if (errs) {
                                errs.map(function (err) {
                                    if (err) {
                                        errorReported = true;
                                    }
                                });
                            }

                            if (errorReported) {
                                throw errs;
                            }

                            un.push(moduleName, null);
                        });
                    });
                },
                'require': function require() {
                }
            };

            rewritten.calls.forEach(function (call) {
                var fnName = call.fn.join('.');
                functions[fnName].apply(null, call.args);
            });

            console.log(code);

            callback(null);
        }
    };
});

var buildPackages = buildConfig.packages || [ ];
var unConfig = unrequire.joinConfigurations(
    unrequire.createDefaultConfiguration(),
    buildUnConfig
);
buildPackages.forEach(function (packageDefinition) {
    var deps = packageDefinition.modules;
    unrequire.execute(deps, unConfig, null, function (errs, value) {
        if (errs) throw errs;
    });
});
return;

// commentChecker :: CodeString -> Int -> Bool
function commentChecker(code) {
    // Super flaky comment regexp
    var commentRe = '//[^\r\n]*';
    commentRe = new RegExp(commentRe, 'g');

    // Mark comment start/ends
    commentRe.lastIndex = 0;
    var comments = [ ];
    var match;
    while ((match = commentRe.exec(code))) {
        comments.push([ match.index, match.index + match[0].length ]);
    }

    return function isCommented(index) {
        return comments.some(function (range) {
            return range[0] <= index && index < range[1];
        });
    };
}

// Returns { code, calls: [ { fn, args } ] }
function rewriteUnrequireCalls(code, scriptName, config) {
    // I know, I know.  This is super flaky.  Sorry.
    var callsRe = '';
    callsRe += '\\b(require|define)[\\s\\r\\n]*\\('; // require or define call
    callsRe += '([\\s\\r\\n]*[\'\"][^,]+,)?';        // Optional first parameter ('name')
    callsRe += '([\\s\\r\\n]*\{[^,]+,)?';            // Optional second parameter ({config})
    callsRe += '([\\s\\r\\n]*\\[[^+]*?\\],)?';       // Optional dependency list (sans chars: +)
    // Extra step so we can split up our RE
    callsRe = new RegExp(callsRe, 'g');

    var calls = [ ];

    // NOTE: A lot of the rest of this is
    // ugly legacy hacked code.

//    var base = path.normalize(config.baseUrl);
//    var script = path.resolve(base, scriptName);
//
//    // HACKY HACKY HACK~
//    var moduleParts = [ ];
//    var baseParts = base.split('/');
//    var scriptParts = script.split('/');
//    var i;
//    for (i = 0; i < baseParts.length; ++i) {
//        if (i >= scriptParts.length) {
//            // Base path goes further than scriptParts; add ..
//            moduleParts.push('..');
//        } else if (baseParts[i] === scriptParts[i]) {
//            // Matching part; do nothing
//        } else {
//            // Differing part; ../part
//            moduleParts.push('..');
//            moduleParts.push(scriptParts[i]);
//        }
//    }
//    for (/* */; i < scriptParts.length; ++i) {
//        moduleParts.push(scriptParts[i]);
//    }

    //var cwd = moduleParts.slice(0, moduleParts.length - 1).join('/');
    //var moduleName = moduleParts[moduleParts.length - 1];
//    var moduleName = moduleParts.join('/');

    var moduleName = path.relative(config.baseUrl, scriptName);

    //exportCallback(moduleParts.join('/'));

    var isCommented = commentChecker(code);

    // WARNING: Not functional
    code = code.replace(callsRe, function (rawCall, reqdef, name, config, deps, index) {
        if (isCommented(index)) {
            return rawCall;
        }

        var args = [ ];
        function addArg(code) {
            if (code !== null && typeof code !== 'undefined') {
                var value;
                try {
                    value = eval(code.replace(/,$/, ''));
                } catch (e) {
                    throw e;
                    // Bleh
                    return;
                }

                args.push(value);
            }
        }

        if (reqdef !== 'require') {
            if (name) {
                addArg(name);
            } else {
                args.push(moduleName);
            }
        }
        addArg(config);
        addArg(deps);
        calls.push({ fn: [ reqdef ], args: args });

        var argsCode = args.map(JSON.stringify).join(', ');
        return reqdef + '(' + argsCode + (args.length ? ', ' : '');
    });

    return {
        code: code,
        calls: calls
    };
}

function simpleUn(writeCallback, exportCallback) {
    var vm = require('vm');

    var sandbox = {
        require: null,
        define: null
    };

    var codes = { };

    function writeCode(name) {
        if (Object.prototype.hasOwnProperty.call(codes, name)) {
            writeCallback(codes[name] + END_SCRIPT);
            delete codes[name];
        }
    }

    var un = require(SAFE_UNREQUIRE_PATH);
    un.reconfigure({
        loadScriptSync: function (scriptName, config) {
            var code;
            try {
                code = fs.readFileSync(scriptName, 'utf8');
            } catch (e){
                if (e.code === 'EBADF') {
                    return false;
                } else {
                    throw e;
                }
            }
            code = rewriteCalls(code, scriptName, config);
            codes[scriptName] = code;

            var calls = getCalls(code, scriptName, config);

            calls.forEach(function (call, i) {
                vm.runInNewContext(call, sandbox, scriptName + ':' + i);
            });

            return true;
        },
        userCallback: function (scriptName, data, moduleValues, scriptNames, moduleNames, callback) {
            scriptNames.forEach(writeCode);

            if (scriptName) {
                writeCode(scriptName);
            }

            callback(null, null);
        }
    });

    sandbox.require = un.require;
    sandbox.define = un.define;

    un.writeRemaining = function () {
        Object.keys(codes).forEach(function (scriptFile) {
            writeCode(scriptFile);
        });
    };

    return un;
}

function simple(config) {
    if (!config.packages) {
        throw new Error('Must define packages in config file');
    }

    var currentOutput = null;
    function writeCallback(data) {
        currentOutput.write(data);
    }

    var exportedModules = [ ];
    function exportCallback(moduleName) {
        exportedModules.push(moduleName);
    }

    var un = simpleUn(writeCallback, exportCallback);
    un.require.config(baseConfig);
    un.require.config(config.requireConfig || { });

    var runningConfig = { packages: { } };

    config.packages.forEach(function (package) {
        if (package.outputFile) {
            var filename = path.resolve(outputDir, package.outputFile);
            currentOutput = fs.createWriteStream(filename);
        } else {
            currentOutput = process.stdout;
        }

        writeCallback('(function () {' + END_SCRIPT);
        if (package.unrequire) {
            writeCallback(fs.readFileSync(outputUnrequirePath) + END_SCRIPT);
        }
        writeCallback('require.config(' + JSON.stringify(runningConfig) + ');' + END_SCRIPT);
        un.require(package.modules);
        writeCallback('})();' + END_SCRIPT);

        un.writeRemaining();

        runningConfig.packages[package.outputFile] = exportedModules;
        exportedModules = [ ];
    });
}

function advanced(output) {
    var vm = require('vm');

    var sandbox = {
        require: null,
        define: null
    };

    function getScriptVariableName(scriptName) {
        // TODO More robust solution
        return scriptName.replace(/[^a-z_$]/ig, '_');
    }

    var un = require(SAFE_UNREQUIRE_PATH);
    un.reconfigure({
        context: sandbox,
        userCallback: function (scriptName, callback, moduleValues, moduleScripts) {
            if (!callback) return;

            var fn = callback.toString();
            var argNames = /\((.*?)\)/.exec(fn)[1].split(/[,\s]+/g);
            var argValues = moduleScripts.map(getScriptVariableName);
            var body = fn.substr(fn.indexOf('{') + 1).replace(/}[\s\r\n]*$/g, '');

            output.write('var ' + getScriptVariableName(scriptName) + ' = ');
            output.write('(function (' + argNames.join(', ') + ') {' + END_SCRIPT);
            output.write(body + END_SCRIPT);
            output.write('})(' + argValues.join(', ') + ');' + END_SCRIPT);

            return null;
        }
    });

    sandbox.require = un.require;
    sandbox.define = un.define;

    output.write('(function () {' + END_SCRIPT);
    un.require(requireConfig, scriptFiles);
    output.write('})();' + END_SCRIPT);
}

var output = process.stdout;

if (args['advanced']) {
    advanced(output);
} else {
    simple(output);
}

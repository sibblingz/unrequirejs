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

function safeComment(message) {
    return '/* ' + message.replace(/\*\//g, '* /') + ' */';
}

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

var outputUnrequire = fs.readFileSync(outputUnrequireFile, 'utf8');

var unrequire = require(SAFE_UNREQUIRE_PATH);

var buildConfig = JSON.parse(fs.readFileSync(args._[0], 'utf8'));

var buildUnConfig = buildConfig.config || { };
if (args['base-url']) {
    buildUnConfig.baseUrl = args['base-url'];
}

var buildPlugins = (buildConfig.plugins && buildConfig.plugins.build) || [ ];
var pluginsPath = (buildConfig.plugins && buildConfig.plugins.path) || [ ];
pluginsPath.push(path.join(__dirname, '../lib'));

function findFile(filename, searchPaths) {
    var i;
    for (i = 0; i < searchPaths.length; ++i) {
        var curFilename = path.resolve(searchPaths[i], filename);
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

    var pluginFilename = findFile(pluginName, pluginsPath);
    if (pluginFilename === null) {
        throw new Error("Could not find plugin: " + pluginName);
    }

    require(pluginFilename);
});

var outputCode = null;

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
                    var args = un.parseRequireArguments(arguments);

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
                    });
                }
            };

            rewritten.calls.forEach(function (call) {
                var fnName = call.fn.join('.');
                functions[fnName].apply(null, call.args);
            });

            outputCode(code, un.normalizeRawName(requestName, config));

            callback(null);
        }
    };
});

var buildPackages = buildConfig.packages || [ ];
var unConfig = unrequire.joinConfigurations(
    unrequire.createDefaultConfiguration(),
    buildUnConfig
);

var runtimePlugins = (buildConfig.plugins && buildConfig.plugins.runtime) || [ ];

var packagesToBuild = buildPackages.slice();
var filesToPackage = { };
function buildNextPackage() {
    var packageDefinition = packagesToBuild.shift();
    var deps = packageDefinition.modules;

    var outputStream = fs.createWriteStream(path.resolve(outputDir, packageDefinition.outputFile));

    if (packageDefinition.unrequire) {
        outputStream.write(safeComment(outputUnrequireFile) + '\n');
        outputStream.write(outputUnrequire);
        outputStream.write(END_SCRIPT);

        // Runtime plugins
        runtimePlugins.forEach(function (pluginName) {
            if (!/\.js$/.test(pluginName)) {
                // Require .js extension
                pluginName += '.js';
            }

            var pluginFilename = findFile(pluginName, pluginsPath);
            if (pluginFilename === null) {
                throw new Error("Could not find plugin: " + pluginName);
            }

            var code = fs.readFileSync(pluginFilename, 'utf8');
            outputStream.write(safeComment(pluginName) + '\n');
            outputStream.write(code);
            outputStream.write(END_SCRIPT);
        });

        // Packages
        var packagesToFiles = { };
        Object.keys(filesToPackage).forEach(function (file) {
            var packageFile = filesToPackage[file].outputFile;
            if (Object.prototype.hasOwnProperty.call(packagesToFiles, packageFile)) {
                packagesToFiles[packageFile].push(file);
            } else {
                packagesToFiles[packageFile] = [ file ];
            }
        });

        Object.keys(packagesToFiles).forEach(function (packageFile) {
            outputStream.write('require.definePackage(');
            outputStream.write(JSON.stringify(packageFile));
            outputStream.write(', ');
            outputStream.write(JSON.stringify(packagesToFiles[packageFile]));
            outputStream.write(');\n');
        });
    }

    outputCode = function (code, moduleName) {
        filesToPackage[moduleName] = packageDefinition;

        outputStream.write(safeComment(moduleName) + '\n');
        outputStream.write(code);
        outputStream.write(END_SCRIPT);
    };

    unrequire.execute(deps, unConfig, null, function (errs, value) {
        if (errs) throw errs;
        outputStream.end();
        buildNextPackage();
    });
}
buildNextPackage();

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

    var moduleName = path.relative(config.baseUrl, scriptName);

    var isCommented = commentChecker(code);

    // WARNING: Not pure
    code = code.replace(callsRe, function (rawCall, reqdef, name, config, deps, index) {
        if (isCommented(index)) {
            return rawCall;
        }

        var args = [ ];
        function addArg(code) {
            if (code === null || typeof code === 'undefined') {
                return;
            }

            var value = eval(code.replace(/,$/, ''));
            args.push(value);
        }

        switch (reqdef) {
        case 'define':
            if (name) {
                addArg(name);
            } else {
                args.push(moduleName);
            }
            addArg(config);
            addArg(deps);
            break;
        case 'require':
            addArg(config);
            addArg(deps);
            break;
        }

        calls.push({ fn: [ reqdef ], args: args });

        var argsCode = args.map(JSON.stringify).join(', ');
        return reqdef + '(' + argsCode + (args.length ? ', ' : '');
    });

    return {
        code: code,
        calls: calls
    };
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

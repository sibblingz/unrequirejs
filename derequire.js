#!/usr/bin/env node

var END_SCRIPT = '\n//*/\n';

function simple(output) {
    var vm = require('vm');
    var fs = require('fs');

    var sandbox = {
        require: null,
        define: null
    };

    var codes = { };

    function writeCode(name) {
        if (Object.prototype.hasOwnProperty.call(codes, name)) {
            output.write(codes[name] + END_SCRIPT);
            delete codes[name];
        }
    }

    // I know, I know.  This is super flaky.  Sorry.
    var callsRe = '';
    callsRe += '\\b(require|define)[\\s\\r\\n]*\\('; // require or define call
    callsRe += '([\\s\\r\\n]*[\'\"][^,]+,)?';        // Optional first parameter ('name')
    callsRe += '([\\s\\r\\n]*\{[^,]+,)?';            // Optional second parameter ({config})
    callsRe += '([\\s\\r\\n]*\\[[^]*?\\])?';         // Optional dependency list
    // Extra step so we can split up our RE
    callsRe = new RegExp(callsRe, 'g');

    function rewriteCalls(code, scriptName, config) {
        var base = path.normalize(config.baseUrl);
        var script = path.resolve(base, scriptName);

        // HACKY HACKY HACK~
        var moduleParts = [ ];
        var baseParts = base.split('/');
        var scriptParts = script.split('/');
        var i;
        for (i = 0; i < baseParts.length; ++i) {
            if (i >= scriptParts.length) {
                // Base path goes further than scriptParts; add ..
                moduleParts.push('..');
            } else if (baseParts[i] === scriptParts[i]) {
                // Matching part; do nothing
            } else {
                // Differing part; ../part
                moduleParts.push('..');
                moduleParts.push(scriptParts[i]);
            }
        }
        for (/* */; i < scriptParts.length; ++i) {
            moduleParts.push(scriptParts[i]);
        }

        var cwd = moduleParts.slice(0, moduleParts.length - 1).join('/');
        var moduleName = moduleParts[moduleParts.length - 1];

        return code.replace(callsRe, function (call, reqdef, name, config, deps) {
            if (name || reqdef === 'require') {
                return call;
            } else {
                // TODO Support custom configs properly (merge)

                return reqdef + '(' + [
                    JSON.stringify('./' + moduleName),
                    JSON.stringify({ cwd: cwd }),
                    deps || '[],'
                ].join(', ');
            }
        });
    }

    function getCalls(code, scriptName) {
        var calls = code.match(callsRe) || [ ];
        return calls.map(function (call) {
            return call + ', function () { });'
        });
    }

    var r = require('./unrequire');
    r.require.env({
        context: sandbox,
        init: function (require, define, env) {
            sandbox.require = require;
            sandbox.define = define;
        },
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
        userCallback: function (scriptName, callback, moduleValues, moduleScripts) {
            moduleScripts.forEach(writeCode);

            if (scriptName) {
                writeCode(scriptName);
            }

            return null;
        }
    });

    output.write('(function () {' + END_SCRIPT);
    output.write(fs.readFileSync(path.join(__dirname, 'unrequire.js')) + END_SCRIPT);
    r.require({
        baseUrl: baseUrl
    }, scriptFiles);
    output.write('})();' + END_SCRIPT);

    scriptFiles.forEach(writeCode);
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

    var r = require('./unrequire');
    r.require.env({
        context: sandbox,
        init: function (require, define, env) {
            sandbox.require = require;
            sandbox.define = define;
        },
        userCallback: function (scriptName, callback, moduleValues, moduleScripts) {
            if (!callback) return;

            var fn = callback.toString();
            var argNames = /\((.*?)\)/.exec(fn)[1].split(/[,\s]+/g);
            var argValues = moduleScripts.map(getScriptVariableName);
            var body = fn.substr(fn.indexOf('{') + 1).replace(/}[\s\r\n]*$/g, '');

            // XXX HACK HACK HACK XXX Remove require, exports, module
            argValues.splice(-3, 3);

            output.write('var ' + getScriptVariableName(scriptName) + ' = ');
            output.write('(function (' + argNames.join(', ') + ') {' + END_SCRIPT);
            output.write(body + END_SCRIPT);
            output.write('})(' + argValues.join(', ') + ');' + END_SCRIPT);

            return null;
        }
    });

    output.write('(function () {' + END_SCRIPT);
    r.require({
        baseUrl: baseUrl
    }, scriptFiles);
    output.write('})();' + END_SCRIPT);
}

var path = require('path');
var args = require('optimist').argv;

if (args.h || args.help || !args.level) {
    console.log('Usage: ' + path.basename(args.$0) + ' [options] --level X scriptFile.js [otherScriptFile.js [...]]');
    console.log('  Compiles an Unrequire.JS project into one script file');
    console.log('');
    console.log('options:');
    console.log('  --base path     Use path as the default module lookup path');
    console.log('  --level X       Compress using level X:');
    console.log('                  SIMPLE: Not supported');
    console.log('                  ADVANCED: ...');
    //console.log('  --exclude path  Do not include the specified module');
    console.log('  -h, --help      Show this help');
    console.log('');
    return;
}

var scriptFiles = args._.map(function (file) {
    return path.resolve(file);
});
var level = args.level;
//var ignoredModules = args.exclude;
var baseUrl = path.resolve(args.base || process.cwd());

var output = process.stdout;

switch (level) {
    case 'SIMPLE':
        simple(output);
        break;
    case 'ADVANCED':
        advanced(output);
        break;
    default:
        throw new Error('Unknown level: ' + level);
}

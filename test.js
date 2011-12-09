var un = require('./index');
var test = require('./tests/test');

var fs = require('fs');
var vm = require('vm');

function runTest(root) {
    var oldCwd = process.cwd();
    process.chdir(root);

    try {
        var scriptName = root + '/run.js';
        var code = fs.readFileSync(scriptName, 'utf8');
        vm.runInNewContext(code, {
            require: un.require,
            test: test,
            console: console
        }, scriptName);
    } finally {
        process.chdir(oldCwd);
    }
}

runTest(__dirname + '/tests/simple-stress');

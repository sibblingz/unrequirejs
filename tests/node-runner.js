module.exports = function (global) {
    var test = require('./test');

    global.test = test
    var unrequire = require('..');
    unrequire.context.test = test;
    return unrequire.require;
};

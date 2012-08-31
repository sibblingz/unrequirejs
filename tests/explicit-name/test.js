if (typeof module !== 'undefined') require = require('../node-runner')(global);

require([ 'a' ], function (a) {
    test.assert(a === 'A', "Module a returns 'A'");
    test.done();
});

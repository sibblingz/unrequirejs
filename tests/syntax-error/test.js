if (typeof module !== 'undefined') require = require('../node-runner')(global);

require(['syntax-error'], function () {
    console.error('This should not be called');
});

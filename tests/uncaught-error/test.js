if (typeof module !== 'undefined') require = require('../node-runner')(global);

require(['uncaught-error'], function () {
    console.error('This should not be called');
});

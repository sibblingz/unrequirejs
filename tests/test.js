var test = (function () {
    var failed = 0;
    var run = 0;

    return {
        assert: function assert(condition, message) {
            ++run;

            if (condition) {
                return;
            }

            ++failed;

            var fullMessage = "Assertion failed" + (message ? ": " + message : "");
            if (console.assert) {
                console.assert(condition, message);
            } else if (console.error) {
                console.error(fullMessage);
            } else {
                throw new Error(fullMessage);
            }
        },
        done: function done() {
            if (failed) {
                console.warn("All tests completed; " + failed + " of " + run + " assertions failed");
            } else {
                (console.info || console.log)("All " + run + " assertions passed");
            }
        }
    };
}());

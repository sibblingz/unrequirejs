var test = (function () {
    var failed = 0;
    var run = 0;
    var completed = false;

    var test = {
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

        assertEqual: function assertEqual(expected, actual, message) {
            var supplement = "expected: " + expected + "; actual: " + actual;
            test.assert(expected === actual, message ? message + " (" + supplement + ")" : supplement);
        },

        step: function step(name) {
            console.info("Test step " + name);
        },

        done: function done() {
            if (completed) {
                throw new Error("Tests already completed");
            }

            completed = true;

            if (failed) {
                console.warn("All tests completed; " + failed + " of " + run + " assertions failed");
            } else {
                console.info("All " + run + " assertions passed");
            }
        }
    };

    return test;
}());

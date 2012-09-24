if (typeof module !== 'undefined') require = require('../node-runner')(global);

require([ 'sub/sub', 'a', 'b', 'c', 'd', 'e', 'f' ], function (sub, A, B, C, D, E, F) {
    test.assertEqual('sub', sub);
    test.assertEqual('A', A);
    test.assertEqual('B', B);
    test.assertEqual('C', C);
    test.assertEqual('D', D);
    test.assertEqual('E', E);
    test.assertEqual('F', F);
    test.done();
});

define([ '../a', '../b', 'a', 'b', './d' ], function (A, B, A2, B2, D) {
    test.assertEqual('A', A, '../a inside of c.js');
    test.assertEqual('B', B, '../b inside of c.js');
    test.assertEqual('A', A2, 'a inside of c.js');
    test.assertEqual('B', B2, 'b inside of c.js');
    test.assertEqual('D', D, './d inside of c.js');
    return A + B + 'C';
});

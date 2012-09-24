define([ 'a', 'b', 'c', 'd', 'e', 'f' ], function (A, B, C, D, E, F) {
    test.assertEqual('A', A);
    test.assertEqual('B', B);
    test.assertEqual('C', C);
    test.assertEqual('D', D);
    test.assertEqual('E', E);
    test.assertEqual('F', F);

    return 'sub';
});

define('a', function () {
    return 'A';
});

define('b', [ 'c' ], function (C) {
    test.assertEqual('C', C);
    return 'B';
});

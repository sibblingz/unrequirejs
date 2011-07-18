define(['../a', '../b', 'assets/a', 'assets/b', './d'], function(A, B, A2, B2, D) { 
	assert('A', A, '../ inside of c.js');
	assert('B', B, '../ inside of c.js');
	assert('A', A2, 'assets/ inside of c.js');
	assert('B', B2, 'assets/ inside of c.js');
	assert('D', D, './ inside of c.js');
	return A + B + 'C';
});

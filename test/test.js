const {FTP} = require('../dist/client').Client;

(async function() {
	var test = new FTP();

	await test.connectAsync(21, "localhost");
	console.info('connected!');
	await test.login('anonymous', 'anonymous@')
	console.info('logged in!');
	await test.pasv();

	//await test.cwd('/in');
	//var dir = await test.pwd();
	//console.info('Current dir is '+dir);

	var res = await test.list();
	console.info(res);

	await test.quit();
})();
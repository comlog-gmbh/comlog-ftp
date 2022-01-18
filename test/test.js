const FTP = require('../dist/client').Client;

(async function() {
	var client = new FTP();

	await client.connectAsync(21, "localhost");
	console.info('connected!');
	await client.login('anonymous', 'anonymous@')
	console.info('logged in!');
	await client.pasv();

	//await test.cwd('/in');
	//var dir = await test.pwd();
	//console.info('Current dir is '+dir);

	var res = await client.list();
	console.info(res);

	await client.quit();
})();
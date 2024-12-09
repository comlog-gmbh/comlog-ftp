const FTP = require('../dist/client').Client;

async function SFTPGoLinux() {
	var client = new FTP();
	//client.debug = true;

	await client.connectAsync(21, "ftp.speedorder.de");
	console.info('connected!');

	await client.enableTLS();


	await client.login('testftp', 'wert2345')
	console.info('logged in!');
	await client.pasv();
	console.info('Switched to passive mode');
	//await client.cwd('/out/cadis');
	//console.info('Changed to /out/cadis');

	//await test.cwd('/in');
	//var dir = await test.pwd();
	//console.info('Current dir is '+dir);

	var res = await client.list();
	console.info(res);

	await client.quit();
}

SFTPGoLinux();

async function SFTPGoWin() {
	var client = new FTP();
	//client.debug = true;

	await client.connectAsync(21, "62.138.154.38");
	console.info('connected!');

	await client.enableTLS();
	await client.login('lohmoeller', 'k2zabAm8GE85')
	console.info('logged in!');
	await client.pasv();
	console.info('Switched to passive mode');

	await client.feat();

	//await client.cwd('/out/cadis');
	//console.info('Changed to /out/cadis');

	//await test.cwd('/in');
	//var dir = await test.pwd();
	//console.info('Current dir is '+dir);

	var res = await client.list();
	console.info(res);

	await client.quit();
}

//SFTPGoWin();

async function SFTPGoTest() {
	var client = new FTP();
	//client.debug = true;

	await client.connectAsync(21, "ftpschedel.de");
	console.info('connected!');
	await client.enableTLS();
	await client.login('ftpsch_6', 'tn9KkWYV4a1q1VGc')
	console.info('logged in!');
	await client.pasv();
	console.info('Switched to passive mode');
	//await client.cwd('/Test/IN/ShipmentLabel');
	//console.info('Changed to /Test');

	//await test.cwd('/in');
	//var dir = await test.pwd();
	//console.info('Current dir is '+dir);

	var res = await client.list();
	console.info(res);

	await client.quit();
}

//SFTPGoTest();

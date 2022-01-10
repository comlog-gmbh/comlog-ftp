# comlog-ftp [![NPM version](https://badge.fury.io/js/comlog-ftp.svg)](https://npmjs.org/package/comlog-ftp) [![Build Status](https://travis-ci.org/ar/comlog-ftp.svg?branch=master)](https://travis-ci.org/ar/comlog-ftp)

> FTP Client with encoding support

## Installation

```sh
$ npm install --save comlog-ftp
```

## Usage Simple way

```js
const FTP = require('../dist/client').Client;

(async function() {
	var conn = new Client();

	await conn.connectAsync(21, "localhost");
	console.info('connected!');
	await conn.login('anonymous', 'anonymous@')
	console.info('logged in!');
	await conn.pasv();

	var res = await conn.list();
	console.info(res);

	await conn.quit();
})();
````

## Usage Adwanced way
```js
const FTP = require('../dist/client').Client;

(async function() {
	var conn = new Client();
	await conn.connectAsync(21, "localhost");

	conn.on('error', function(err) {
		console.error(err);
	});

    // Optional custom data handling
	conn.on('data', function(data) {
		// custom socket data handling
	});

	// Optional custom code 220 handling (all ftp codes can be used)
	this.on('220', function (chunk) {
		this.write('USER ' + this.user, function(){});
	});

	conn.get('/some_filename.txt', 'c:\\some_filename.txt')
        .then(function() {
            console.info('Download Success!');
        })
        .catch(function (err) {
			console.error(err);
		})
    ;
	
	// OR
	conn.raw('ALLO')
        .then(function(response) {
            console.info(response);
        })
        .catch(function (err) {
			console.error(err);
		})
    ;
	
	await conn.quit();
})();
```

## Functions
 - connect( callback ) void
 - write( command, [callback] ) void
 - raw( command, [args], callback ) void
 - feat( callback ) void
 - list( callback ) void
 - get( removeFilePath, [localFilePath], callback ) void
 - put( localFilePath, [removeFilePath], callback ) void
 - cwd( remotePath, callback ) void
 - pwd( callback ) void
 - rename( remoteFromPath, remoteToPath, callback) void
 - delete( remoteFilePath, callback ) void
 - mkdir( remotePath, callback ) void
 - rmdir( remoteDir, callback ) void
 - stat( callback ) void
 - destroy() void

## Properties
 - {int} port Default: 21
 - {String} host Default: "localhost"
 - {boolean} active Default: true
 - {int} timeout Default: 10 * 60 * 1000
 - {String} type Default: 'I'
 - {boolean} debug Default: false

## CHANGELOG
 - New Promise based FTP Client

## License

ISC © [COMLOG GmbH](http://www.comlog.org)

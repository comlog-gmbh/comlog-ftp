# comlog-ftp [![NPM version](https://badge.fury.io/js/comlog-ftp.svg)](https://npmjs.org/package/comlog-ftp) [![Build Status](https://travis-ci.org/ar/comlog-ftp.svg?branch=master)](https://travis-ci.org/ar/comlog-ftp)

FTP Client with encoding, passive and active modes. Promises based. TLS (SSL) support for passive mode.

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
 - connect(port, [host], [cb]) void
 - connectAsync(port, [host]) Promise
 - setEncoding(encoding)
 - enableTLS([options])
 - getSocket(): net.Socket|tls.TLSSocket
 - getResponseListner([transferTimeout]): ResponseListener
 - login( user, [pass]) Promise<ResponseList>
 - write( command, [encoding], [callback] ) boolean
 - raw( command, [args] ) Promise<ResponseList>
 - rawlist(dir?:string): Promise<string>
 - openActiveSocket() Promise<net.Server>
 - openPassiveSocket() Promise<net.Socket | tls.TLSSocket>
 - rawTransfer(cmd: string) : Promise<Response|undefined>
 - pasv([get_data_channel: boolean]) Promise<{host:string, port:number}>
 - feat() Promise<Map<string, string>>
 - list (dir?: string) : Promise<ListEntry[]>
 - get(src : string, dst? : string | stream.Writable) : Promise<void>
 - put(src : string | stream.Readable, dst?: string) : Promise<void>
 - cwd (dir : string) : Promise<ResponseList>
 - pwd () : Promise<string>
 - rename(src : string, dst : string) : Promise<ResponseList>
 - delete (target : string) : Promise<ResponseList>
 - rm (target : string) : Promise<ResponseList> Alias to delete
 - mkdir (target : string) : Promise<ResponseList>
 - rmdir (target : string) : Promise<ResponseList>
 - stat (): Promise<ResponseList>
 - destroy([error]) void
 - end([data], [encoding], [callback]) Promise<void>
 - quit() Promise<ResponseList>
 - on(event, listener) Instance of EventEmitter
 - once(event, listener) Instance of EventEmitter
 - off(event, ?listener) Instance of EventEmitter

## Properties
 - {number} port Default: 21
 - {string} host Default: "localhost"
 - {boolean} active Default: true
 - {number} timeout Default: 10 * 60 * 1000
 - {string} type Default: 'I'
 - {boolean} debug Default: false
 - {string} encoding Default: 'binary'

## CHANGELOG
 - New Promise based FTP Client
 - Added TLS support
 - Compatibility (end and destroy functions)
 - Added quit function
 - Added EPSV Support and fallback to PASV

## License

ISC © [COMLOG GmbH](http://www.comlog.org)

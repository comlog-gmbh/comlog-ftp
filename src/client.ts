import net from "net";
import {FTPError} from "./FTPError";
import {Response} from "./Response";
import {ResponseList} from "./ResponseList";
import stream from "stream";
import fs from "fs";
import path from "path";
const ListingParser = require("parse-listing");
const PASV_REGEXP = /([-\d]+,[-\d]+,[-\d]+,[-\d]+),([-\d]+),([-\d]+)/;

/**
 * @property {null|module:net.Server} activeServer
 */
export class Client extends net.Socket {
	lastMessage = null;
	active = true;
	type = 'I';
	encoding = 'binary';
	debug = false;
	resultTime = 10000;
	transferTimeout = this.resultTime;
	transferEncoding = null;
	host = '127.0.0.1';
	port = 21;

	defaults = {
		host: '127.0.0.1',
		port: 21,
		encoding: 'binary'
	};

	constructor(opt?: any) {
		super(opt);
		var _this = this;

		// Data parser
		this.on('data', function (chunk) {
			if (_this.debug) console.log(chunk);
			// @ts-ignore
			var lines = chunk.split("\r\n").join("\n").split("\r").join('\n').split("\n");
			for (var i=0; i < lines.length; i++) {
				if (lines[i].trim() !== '') {
					_this.lastMessage = lines[i];
					var code = lines[i].substring(0,3);
					if (!isNaN(code)) {
						if (_this.debug) console.log('Emit '+code+' event');
						_this.emit(code, lines[i], code);
					}
				}
			}
		});
	}

	/**
	 * Set transfer encoding
	 * @param {string} encoding
	 */
	setEncoding(encoding: string) {
		this.encoding = encoding;
		return super.setEncoding(encoding)
	};

	/**
	 * Get response from control channel
	 * @param {number|null} [resultTime] wait timeout in ms. 0 = no timeout
	 * @return {Promise<ResponseList>}
	 */
	getResponse(resultTime?: number) : Promise<ResponseList> {
		var _this = this;
		var completed = false;
		return new Promise(function(resolve, reject) {
			var timer: any;
			var err_fn = function (err: Error) {
				if (timer) clearTimeout(timer);
				off_fn();
				if (!completed) {
					completed = true;
					reject(err);
				}
			};

			var close_fn = function () {
				if (timer) clearTimeout(timer);
				off_fn();
				if (!completed) {
					completed = true;
					reject(new Error('The connection was closed before the response was sent'));
				}
			};

			var data_fn = function (chunk: string) {
				if (timer) clearTimeout(timer);
				off_fn();
				if (!completed) {
					var data = '';
					var lines = chunk.split("\r\n");
					for (var i=0; i < lines.length; i++) {
						if (lines[i] !== '' && lines[i].substr(0, 3) !== '220')
							data += lines[i]+"\r\n";
					}
					if (data.trim() !== '') {
						completed = true;
						resolve(new ResponseList(data));
					}
				}
			};

			var off_fn = function () {
				_this.off('error', err_fn);
				_this.off('close', close_fn);
				_this.off('data', data_fn);
			};

			_this.once('error', err_fn);
			_this.once('close', close_fn);
			_this.on('data', data_fn);

			if (typeof resultTime == 'undefined' || resultTime === null) resultTime = _this.resultTime;

			if (resultTime > 0) {
				timer = setTimeout(function () {
					if (!completed) {
						completed = true;
						// @ts-ignore
						reject(new Error('Waiting for response timeout ('+(resultTime / 1000)+'sec)'));
					}
				}, resultTime);
			}
		});
	};

	/**
	 * Get response from control channel
	 * @param {number|null} [resultTime] wait timeout in ms. 0 = no timeout
	 * @return {Promise<Response>}
	 */
	getLastResponse (resultTime?: number) : Promise<Response> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.getResponse(resultTime)
				.then(function (list) {
					resolve(list.pop())
				})
				.catch(reject)
			;
		})
	};

	/**
	 * @see module:net.Socket
	 * @param {number|string} port
	 * @param {string} [host]
	 * @param {function} cb
	 * @return {FTP}
	 */
	// @ts-ignore
	connect (port: any, host?: any, cb?: Function | null) : this {
		var _this = this;
		if (this.encoding) this.setEncoding(this.encoding);

		if (cb) {
			var timer: NodeJS.Timeout;
			var err_fn = function (err: Error) {
				if (timer) clearTimeout(timer);
				if (cb) cb(err);
				cb = null;
				off_fn();
			};

			/** !-- recive wilcome message --> */
			var cb_timeout: NodeJS.Timeout
			var res_220: any[] = [];
			var res_other: any[] = [];

			var data_fn = function (data: string) {
				if (timer) clearTimeout(timer);
				if (cb_timeout) clearTimeout(cb_timeout);

				if (cb) {
					if (data.substr(0, 3) === '220') res_220.push(data);
					else res_other.push(data);

					cb_timeout = setTimeout(function () {
						if (res_220.length > 0) {
							// @ts-ignore
							cb(null, res_220.join(""));
						}
						else {
							// @ts-ignore
							cb(new FTPError(res_other.join("")));
						}
						cb = null;
						off_fn();
					}, 1000);
				}
			}
			/** <-- recive wilcome message --! */

			var close_fn = function () {
				if (timer) clearTimeout(timer);
				if (cb) {
					cb(new Error('The connection was closed before the welcome message was sent'));
				}
				cb = null;
				off_fn();
			}

			var off_fn = function () {
				_this.off('error', err_fn);
				_this.off('data', data_fn);
				_this.off('close', close_fn);
			};

			_this.once('error', err_fn);
			_this.on('data', data_fn);
			_this.once('close', close_fn);

			_this.once('ready', function () {
				timer = setTimeout(function () {
					if (cb) cb(new Error('Waiting welcome message timeout ('+(_this.resultTime / 1000)+'sec)'));
					cb = null;
				}, _this.resultTime);
			});
		}

		super.connect(port, host);
		return _this;
	};

	/**
	 * Connect to FTP Async
	 * @param port
	 * @param host
	 */
	connectAsync(port: any, host: string) {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.connect(port, host, function (err: Error) {
				if (err) reject(err);
				resolve(_this);
			});
		});
	}

	/**
	 * Run FTP Command
	 * @param {string} data
	 * @return {Promise<ResponseList>}
	 */
	raw(data: string) : Promise<ResponseList> {
		var _this = this;
		return new Promise(function(resolve, reject) {
			_this.getResponse()
				.then(function (res) {
					resolve(res);
				})
				.catch(reject);

			_this.write(data + '\r\n', _this.encoding);
		});
	};

	/**
	 * Login on server
	 * @param {string} user
	 * @param {string} pass
	 * @return {Promise<void>}
	 */
	login(user: string, pass: string) {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('USER ' + user)
				.then(function (res) {
					if (res.codeExists(331)) {
						_this.raw('PASS ' + pass)
							.then(function (res2) {
								if (res2.codeExists(230)) {
									resolve(res2);
								}
								else {
									reject(new FTPError(res2))
								}
							})
							.catch(reject);
					}
					else {
						reject(new FTPError(res))
					}
				})
				.catch(reject);
		});
	};

	/**
	 * Change to Passiv mode
	 * @param {boolean} [get_data_channel]
	 * @return {Promise<{host:string, port:number}>}
	 */
	pasv(get_data_channel?: boolean) : Promise<{host:string, port:number}> {
		var _this = this;
		return new Promise(function(resolve, reject) {
			if (get_data_channel) {
				var _parseResponse: (res: ResponseList) => void;

				_parseResponse = function (res: ResponseList) {
					if (res.inRange(227, 229)) {
						_this.active = false;
						var match = (res.toString()).match(PASV_REGEXP);
						if (match) {
							var popts = {
								host: match[1].split(',').join("."),
								port: (parseInt(match[2], 10) & 255) * 256 + (parseInt(match[3], 10) & 255)
							};

							if (popts.host === "127.0.0.1") popts.host = _this.host;
							resolve(popts);
						}
						else {
							reject(new Error('Parsing passive mode settings: '+res));
						}
					}
					else {
						if (res.inRange(250)) {
							_this.getResponse()
								.then(_parseResponse)
								.catch(reject);
						}
						else {
							reject(new FTPError(res));
						}
					}
				};

				_this.raw('PASV')
					.then(_parseResponse)
					.catch(reject);
			}
			else {
				_this.active = false;
				resolve({
					host: _this.host,
					port: _this.port
				});
			}
		});
	}

	/**
	 * Create and emit active socket
	 * @return {Promise<module:net.Server>}
	 */
	openActiveSocket() : Promise<net.Server> {
		var _this = this;
		return new Promise(function(resolve, reject: Function) {
			var server = net.createServer();

			server.on('error', function(e){
				if (reject) {
					reject(e);
					// @ts-ignore
					reject = null;
				}
			});

			server.on('close', function() {
				if (reject) {
					reject(new Error('Aktive server closed'));
					// @ts-ignore
					reject = null;
				}
			});

			server.on('connection', function(socket) {
				// @ts-ignore
				reject = null;
				socket.on('close', function () {
					server.close();
				});
			});

			server.listen(function() {
				if (_this.debug) console.info('Active server started');
				var address = server.address();
				if (typeof address == 'object' && address !== null) {
					var port = address.port;
					var p1 = Math.floor(port / 256);
					var p2 = port % 256;

					var ip = _this.localAddress.split('.').join(',');
					_this.raw('PORT ' + ip + ',' + p1 + ',' + p2)
						.then(function (res) {
							if (res.inRange(200, 299)) {
								resolve(server);
							}
							else {
								reject(new FTPError(res));
							}
						})
						.catch(function (err) {
							if (reject) reject(err);
						});
				}
				else {
					reject(new FTPError("Can't get Active socket address"));
				}
			});
		});
	}

	/**
	 * Create and emit passive socket
	 * @return {Promise<module:net.Socket>}
	 */
	openPassiveSocket() : Promise<net.Socket> {
		var _this = this;
		return new Promise(function(resolve, reject) {
			_this.pasv(true)
				.then(function (popts) {
					var dsock = new net.Socket();
					if (_this.transferTimeout) dsock.setTimeout(_this.transferTimeout);
					dsock.connect(popts.port, popts.host);
					dsock.on('ready', function () {
						// @ts-ignore
						reject = null;
						resolve(dsock);
					});
					dsock.on('error', function (err) {
						if (reject) reject(err);
					});
				})
				.catch(reject);
		});
	}

	/**
	 * Run command and open data channel
	 * @param {string} cmd
	 * @return {Promise<Response>}
	 */
	rawTransfer(cmd: string) : Promise<Response> {
		var _this = this;
		return new Promise(function(resolve, reject) {
			var TransferRes: Response | null = null;
			var socketEnd = false;

			if (_this.active) {
				_this.openActiveSocket()
					.then(function(server) {
						// Data connection timeout
						var timeout = setTimeout(function () {
							reject(new Error('Data (Active) connection from Server timeout'));
						}, _this.transferTimeout);

						// Send command
						_this.raw(cmd)
							.then(function (res) {
								if (timeout) clearTimeout(timeout);

								if (_this.debug) console.info(cmd)
								if (res.isError()) {
									return reject(new FTPError(res));
								}
								else {
									_this.getLastResponse(0)
										.then(function (tres) {
											TransferRes = tres;
											if (TransferRes && socketEnd) {
												resolve(TransferRes);
											}
										})
										.catch(function (err) {
											reject(err);
										})
								}
							})
							.catch(function (err) {
								if (timeout) clearTimeout(timeout);
								reject(err);
							});

						server.on('connection', function(dataSocket) {
							if (timeout) clearTimeout(timeout);
							if (_this.debug) console.info('Incomming active connection');
							dataSocket.setKeepAlive(true, 5000);

							dataSocket.on('end', function () {
								socketEnd = true;
								if (TransferRes && socketEnd) resolve(TransferRes);
							});

							_this.emit('datachannel', dataSocket);
						});
					})
					.catch(reject)
			}
			else {
				_this.openPassiveSocket()
					.then(function (dataSocket) {
						var ConnRes : ResponseList | Response | null = null;
						dataSocket.on('end', function () {
							socketEnd = true;
							if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
						});

						_this.getResponse(0)
							.then(function (cres) {
								if (cres.getByCode(150)) ConnRes = cres.getByCode(150);
								if (cres.getByCode(125)) ConnRes = cres.getByCode(125);
								if (cres.getByCode(226)) TransferRes = cres.getByCode(226);
								if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
							})
							.catch(function (err) {
								reject(err);
							})
						;

						_this.emit('datachannel', dataSocket);

						_this.raw(cmd)
							.then(function (res) {
								if (res.isSuccess()) {
									_this.getResponse(0)
										.then(function (cres) {
											if (cres.getByCode(150)) ConnRes = cres.getByCode(150);
											if (cres.getByCode(226)) TransferRes = cres.getByCode(226);
											if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
										})
										.catch(function (err) {
											reject(err);
										})
									;
								}
								else {
									reject(new FTPError(res));
								}
							})
							.catch(function (err) {
								dataSocket.destroy();
								reject(err);
							});
					})
					.catch(reject);
			}
		});
	}

	/**
	 * Quit ftp
	 * @return {Promise<string>}
	 */
	quit() {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('QUIT')
				.then(function (res) {
					if (res.isSuccess()) resolve(res);
					reject(new FTPError(res))
				})
				.catch(reject);
		})

	}

	/**
	 * Get file list from FTP
	 * @param {string} dir
	 * @return {Promise<string>}
	 */
	rawlist(dir?:string) {
		var _this = this;
		return new Promise(function(resolve, reject) {
			var rawlist = '';
			var error : Error | null = null;
			if (!dir) dir = '.'

			_this.once('datachannel', function (dataSocket) {
				dataSocket.on('data', function (chunk: string) {
					rawlist += chunk;
				});

				dataSocket.on('error', function (err : Error) {
					error = err;
				});
			});

			_this.rawTransfer('LIST '+(dir || ''))
				.then(function () {
					if (error) reject(error);
					else resolve(rawlist);
				})
				.catch(function (err) {
					reject(err);
				})
		});
	}

	/**
	 * Get file list from FTP
	 * @param {string} dir
	 * @return {Promise<[{}]>}
	 */
	list (dir?: string) : Promise<[{}]> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.rawlist(dir)
				.then(function (data) {
					ListingParser.parseFtpEntries(data, function(parseErr: null | Error, files: any) {
						if (parseErr) return reject(parseErr);
						resolve(files);
					});
				})
				.catch(reject);
		});
	};

	/**
	 * Upload file to Server
	 * @param {string|module:stream.Readable} src
	 * @param {string} [dst]
	 * @return {Promise<void>}
	 */
	put(src : string | stream.Readable, dst?: string) : Promise<void> {
		var _this = this;
		return new Promise(function(resolve, reject) {
			var readStream : stream.Readable;

			if (src instanceof stream.Readable) {
				readStream = src;
			}
			else {
				if (_this.transferEncoding) {
					readStream = fs.createReadStream(src, {encoding: _this.transferEncoding});
				}
				else {
					readStream = fs.createReadStream(src);
				}
			}

			var error : Error;
			readStream.on('error', function (err) {
				error = err;
			});

			_this.once('datachannel', function (dataSocket) {
				readStream.pipe(dataSocket);

				dataSocket.on('error', function (err: Error) {
					error = err;
				});
			});

			if (!dst) {
				// TODO Test
				// @ts-ignore
				dst = path.basename(readStream.filename || readStream.path);
			}

			_this.rawTransfer('STOR '+dst)
				.then(function (res) {
					if (error) reject(error);
					else if (res.isError()) reject(new FTPError(res));
					else resolve();
				})
				.catch(function (err) {
					reject(err);
				})
			;
		});
	}

	/**
	 * Download file from Server
	 * @param {string} src
	 * @param {string} [dst]
	 * @return {Promise<void>}
	 */
	get(src : string, dst? : string | stream.Writable) : Promise<void> {
		var _this = this;
		return new Promise(function(resolve, reject) {
			var writeStream : stream.Writable;
			if (!dst) dst = path.basename(src);

			if (dst instanceof stream.Writable) {
				writeStream = dst;
			}
			else {
				if (_this.transferEncoding) {
					writeStream = fs.createWriteStream(dst, {encoding: _this.transferEncoding});
				}
				else {
					writeStream = fs.createWriteStream(dst);
				}
			}

			var error : Error;
			writeStream.on('error', function (err) {
				error = err;
			});

			_this.once('datachannel', function (dataSocket) {
				dataSocket.pipe(writeStream);

				dataSocket.on('error', function (err:Error) {
					error = err;
				});
			});

			_this.rawTransfer('RETR '+src)
				.then(function (res) {
					if (error) reject(error);
					else if (res.isError()) reject(new FTPError(res));
					else resolve();
				})
				.catch(function (err) {
					reject(err);
				})
			;
		});
	};

	/**
	 * Change to directory
	 * @param {string} dir
	 * @return {Promise<ResponseList>}
	 */
	cwd (dir : string) : Promise<ResponseList> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('CWD '+(dir))
				.then(function (res) {
					if (res.isSuccess()) resolve(res);
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};

	/**
	 * Get current path
	 * @return {Promise<string>}
	 */
	pwd () : Promise<string> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('PWD')
				.then(function (res) {
					if (res.isSuccess()) {
						var data = res.toString();
						var start = data.indexOf('"');
						if (start < 0) return reject(new FTPError(res));
						var ende = data.indexOf('"', start+1);
						if (ende < 0) return reject(new FTPError(res));

						resolve(data.substring(start+1, ende));
					}
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};

	/**
	 * Get current path
	 * @param {string} src
	 * @param {string} dst
	 * @return {Promise<ResponseList>}
	 */
	rename(src : string, dst : string) : Promise<ResponseList> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('RNFR '+src)
				.then(function (res) {
					if (res.isSuccess()) {
						_this.raw('RNTO '+dst)
							.then(function (res) {
								if (res.isSuccess()) resolve(res);
								else reject(new FTPError(res))
							})
							.catch(reject);
					}
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};

	/**
	 * Remove file
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	delete (target : string) : Promise<ResponseList> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('DELE '+(target))
				.then(function (res) {
					if (res.isSuccess()) resolve(res);
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};

	/**
	 * Remove file
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	rm (target : string) : Promise<ResponseList> { return this.delete(target); }

	/**
	 * Create a directory
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	mkdir (target : string) : Promise<ResponseList> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('MKD '+(target))
				.then(function (res) {
					if (res.isSuccess()) resolve(res);
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};

	/**
	 * delete file
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	rmdir (target : string) : Promise<ResponseList> {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('RMD '+(target))
				.then(function (res) {
					if (res.isSuccess()) resolve(res);
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};

	/**
	 * Get current path
	 * @return {Promise<ResponseList>}
	 */
	feat () {
		var _this = this;
		return new Promise(function (resolve, reject) {
			var data = '';
			var _on_data = function (chunk : string) {
				data += chunk;
				if (data.indexOf('211 End') > -1) {
					_this.off('data', _on_data);
					_this.off('error', _on_error);
					if (resolve) {
						let tmp = data.split("\n");
						tmp.shift();
						tmp.pop();
						resolve(tmp.join("\n"));
						// @ts-ignore
						resolve = null;
					}
				}
			};

			var _on_error = function (err : Error) {
				_this.off('data', _on_data);
				_this.off('error', _on_error);

				if (resolve) {
					reject(err);
					// @ts-ignore
					resolve = null;
				}
			};

			_this.on('data', _on_data);
			_this.on('error', _on_error);

			_this.write("FEAT\r\n");
		});
	};

	/**
	 * Get current path
	 * @return {Promise<ResponseList>}
	 */
	stat () {
		var _this = this;
		return new Promise(function (resolve, reject) {
			_this.raw('STAT')
				.then(function (res) {
					if (res.isSuccess()) {
						resolve(res);
					}
					else reject(new FTPError(res))
				})
				.catch(reject);
		});
	};
}
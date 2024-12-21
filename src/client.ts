import net, {Socket} from "net";
import tls, {ConnectionOptions, TLSSocket} from "tls";
import {FTPError} from "./FTPError";
import {Response} from "./Response";
import {ResponseList} from "./ResponseList";
import {ResponseListener} from "./ResponseListener";
import {ListEntry, parseListOutput, parseMlsdOutput} from "./ListParser";
import stream from "stream";
import fs from "fs";
import path from "path";
import EventEmitter from "node:events";

const PASV_REGEXP = /([-\d]+,[-\d]+,[-\d]+,[-\d]+),([-\d]+),([-\d]+)/;
const EPSV_REGEXP = /\(([^|]*)\|([^|]*)\|([^|]*)\|(\d+)\|([^)]*)\)/;
const socketEvents = ["connect", "data", "end", "error", "close"];

export class Client extends EventEmitter {
	lastMessage: string|null = null;
	active = true;
	type: string = 'I'; // I = Binary, A = ASCII
	encoding = 'binary';
	debug = false;
	resultTime = 20000;
	transferTimeout = this.resultTime;
	transferEncoding: string|null = null;
	host: string = '127.0.0.1';
	port: number = 21;
	socket: net.Socket;
	tlsSocket: tls.TLSSocket|null = null;
	tlsOptions: tls.ConnectionOptions = {};
	useTLSDataChannel = false;
	featuers: Map<string, string>|null = null;
	private MLSTSend = false;

	constructor(opt?: any) {
		super();
		const _this = this;

		this.socket = new net.Socket(opt);

		// Socket events umleiten
		for (const event of socketEvents) {
			this.socket.on(event, (...args) => {
				this.emit(event, ...args); // Emit the same event on the wrapper
			});
		}


		// Data parser
		this.on('data', function (chunk) {
			if (_this.debug) console.info("CONTROL DATA: " + chunk);
			const lines = (chunk+'').split("\r\n").join("\n").split("\r").join('\n').split("\n");
			for (let i=0; i < lines.length; i++) {
				if (lines[i].trim() !== '') {
					_this.lastMessage = lines[i];
					const code = lines[i].substring(0,3);
					if (!isNaN(Number(code))) {
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
		if (this.tlsSocket) this.tlsSocket.setEncoding(encoding);
		return this.socket.setEncoding(encoding);
	};

	/**
	 * @see module:net.Socket
	 * @param {number|string} port
	 * @param {string} [host]
	 * @param {function} cb
	 * @return {this}
	 */
	connect (port: number, host?: any, cb?: Function | null) : this {
		const _this = this;
		if (this.encoding) this.setEncoding(this.encoding);

		this.port = port;
		if (host) this.host = host;

		if (cb) {
			let timer: NodeJS.Timeout;
			const err_fn = function (err: Error) {
				if (timer) clearTimeout(timer);
				if (cb) cb(err);
				cb = null;
				off_fn();
			};

			/** !-- recive wilcome message --> */
			let cb_timeout: NodeJS.Timeout
			let res_220: any[] = [];
			let res_other: any[] = [];

			const data_fn = function (data: string) {
				if (timer) clearTimeout(timer);
				if (cb_timeout) clearTimeout(cb_timeout);

				if (cb) {
					if (data.substring(0, 3) === '220') res_220.push(data);
					else res_other.push(data);

					cb_timeout = setTimeout(async function () {
						if (res_220.length > 0) {
							if (cb) {
								await _this.raw("TYPE "+_this.type);
								await _this.raw("STRU F");
								if (_this.encoding.toUpperCase().indexOf('UTF') > -1 && _this.encoding.toUpperCase().indexOf('8') > -1) {
									await _this.raw("OPTS UTF8 ON");
								}

								cb(null, res_220.join(""));
							}
						}
						else {
							if (cb) cb(new FTPError(res_other.join("")));
						}
						cb = null;
						off_fn();
					}, 1000);
				}
			}
			/** <-- recive wilcome message --! */

			const close_fn = function () {
				if (timer) clearTimeout(timer);
				if (cb) cb(new Error('The connection was closed before the welcome message was sent'));
				cb = null;
				off_fn();
			}

			const off_fn = function () {
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

		this.socket.connect(port, host);
		return _this;
	};

	/**
	 * Connect to FTP Async
	 * @param port
	 * @param host
	 */
	connectAsync(port: any, host: string): Promise<Socket> {
		const _this = this;
		return new Promise(function (resolve, reject) {
			_this.connect(port, host, function (err: Error) {
				if (err) reject(err);
				resolve(_this.socket);
			});
		});
	}

	/**
	 * Close socket connection
	 * @param callback Optionaler Callback,
	 * @returns Promise
	 */
	end(callback?: (err?: Error) => void): Promise<void> {
		return new Promise((resolve, reject) => {
			const handleError = (err: Error) => {
				if (callback) callback(err);
				reject(err);
			};

			const handleClose = () => {
				if (callback) callback();
				resolve();
			};

			this.socket.once("error", handleError);
			this.socket.once("close", handleClose);

			this.socket.end();
			if (this.tlsSocket) {
				this.tlsSocket.end();
			}
		});
	}

	destroy(error?: Error) {
		// @ts-ignore
		if (this.tlsSocket) this.tlsSocket.destroy(error);
		// @ts-ignore
		if (this.socket) this.socket.destroy(error);
		this.tlsSocket = null;
		//this.tlsOptions = {};
		//this.useTLSDataChannel = false
	}

	enableTLS(options: ConnectionOptions = {}): Promise<TLSSocket> {
		const _this = this;
		let tls_defaults: tls.ConnectionOptions = {rejectUnauthorized: false};
		if (!net.isIPv4(_this.host) && !net.isIPv6(_this.host)) {
			tls_defaults.servername = _this.host;
		}

		this.tlsOptions = Object.assign({}, tls_defaults, options, {socket: _this.socket});

		return new Promise(async function (resolve, reject) {
			const res = await _this.raw("AUTH TLS");

			// SSL Verbindung ist erlaubt
			if (res.codeExists(234)) {
				_this.tlsSocket = tls.connect(_this.tlsOptions, async function () {
					const expectCertificate = _this.tlsOptions.rejectUnauthorized !== false
					if (expectCertificate && !_this.tlsSocket!.authorized) {
						reject(_this.tlsSocket!.authorizationError)
					} else {
						// Socket events umleiten
						for (const event of socketEvents) {
							_this.tlsSocket!.on(event, (...args) => {
								_this.emit(event, ...args); // Emit the same event on the wrapper
							});
						}
						await _this.raw("PBSZ 0");
						const prot_res = await _this.raw("PROT P");
						if (prot_res.isSuccess()) {
							_this.useTLSDataChannel = true;
						}

						resolve(_this.tlsSocket!);
					}
				});

				_this.tlsSocket.setEncoding(_this.encoding);

				_this.tlsSocket.once('error', function (err) {
					_this.tlsSocket = null;
					reject(err);
				});
			}
			else {
				reject(new Error("TLS not supported by server: " + res.toString()));
			}
		});
	}

	public getSocket() {
		return this.tlsSocket || this.socket;
	}

	public getResponseListner(transferTimeout?: number) {
		if (typeof transferTimeout == 'undefined' || transferTimeout === null) transferTimeout = this.transferTimeout;
		return new ResponseListener(this.getSocket(), transferTimeout);
	}

	private write(data: string, encoding?: string, cb?: ((err?: (Error | undefined)) => void) | undefined): boolean {
		if (this.debug) console.info("CONTROL WRITE: " + data);
		let enc = encoding ? encoding : this.encoding;
		return this.getSocket().write(data, enc, cb);
	}

	/**
	 * Run FTP Command
	 * @param {string} data
	 * @return {Promise<ResponseList>}
	 */
	raw(data: string) : Promise<ResponseList> {
		const _this = this;
		return new Promise(function(resolve, reject) {
			_this.getResponseListner().wait()
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
	 * @return {Promise<ResponseList>}
	 */
	async login(user: string, pass: string): Promise<ResponseList> {
		const res: ResponseList = await this.raw('USER ' + user);

		if (res.codeExists(331)) {
			const res2 = await this.raw('PASS ' + pass);
			if (res2.codeExists(230)) {
				return res2;
			}
			else {
				throw new FTPError(res2);
			}
		}
		else {
			throw new FTPError(res);
		}
	};

	/**
	 *
	 */
	feat(reload: boolean = false): Promise<Map<string, string>> {
		const _this = this;
		return new Promise((resolve, reject) => {
			if (_this.featuers && !reload) {
				resolve(_this.featuers);
				return;
			}

			_this.featuers = new Map()
			_this.getResponseListner().waitUntil(/211 End|211 no/i)
				.then(function (res) {
					//let lines = res.toString().split("\r\n");
					res.toString().split("\n").slice(1, -1).forEach(line => {
						const entry = line.trim().split(" ")
						_this.featuers!.set(entry[0], entry[1] || "")
					})
					resolve(_this.featuers!);
				})
				.catch(reject);

			_this.write('FEAT\r\n', this.encoding);
		});
	}

	/**
	 * Change to Passiv mode
	 * @param {boolean} [get_data_channel]
	 * @return {Promise<{host:string, port:number}>}
	 */
	async pasv(get_data_channel?: boolean) : Promise<{host:string, port:number}> {
		const _this = this;
		if (get_data_channel) {
			const _parseResponse = async function (res: ResponseList): Promise<{host:string, port:number}> {
				if (res.inRange(227, 229)) {
					_this.active = false;
					const popts = {
						host: _this.host,
						port: 0
					};

					// PASV Rückgabe
					let match = (res.toString()).match(PASV_REGEXP);
					if (match) {
						popts.host = match[1].split(',').join(".");
						popts.port =  (parseInt(match[2], 10) & 255) * 256 + (parseInt(match[3], 10) & 255);
						if (popts.host === "127.0.0.1") popts.host = _this.host;
					}
					else {
						// EPSV Rückgabe
						match = (res.toString()).match(EPSV_REGEXP);
						if (match) {
							popts.port = parseInt(match[4]);
							if (popts.host === "127.0.0.1") popts.host = _this.host;
						}
						else {
							throw new Error('Parsing passive mode settings: '+res);
						}
					}

					return popts;
				}
				else {
					if (res.inRange(250)) {
						const response = await _this.getResponseListner().wait();
						return _parseResponse(response);
					}
					else {
						throw new FTPError(res)
					}
				}
			};

			let res;
			try {
				res = await _parseResponse(await this.raw('EPSV'))
			}
			catch (e) {
				res = await _parseResponse(await this.raw('PASV'))
			}

			return res;
		}
		else {
			_this.active = false;
			return {
				host: _this.host,
				port: _this.port
			};
		}
	}

	/**
	 * Create and emit active socket
	 * @return {Promise<module:net.Server>}
	 */
	openActiveSocket() : Promise<net.Server> {
		const _this = this;
		return new Promise(function(resolve, reject: ((reason?: any) => void)|null) {
			const server = net.createServer();

			server.on('error', function(e){
				if (reject) {
					reject(e);
					reject = null;
				}
			});

			server.on('close', function() {
				if (reject) {
					reject(new Error('Aktive server closed'));
					reject = null;
				}
			});

			server.on('connection', function(socket) {
				reject = null;
				socket.on('close', function () {
					server.close();
				});
			});

			server.listen(function() {
				if (_this.debug) console.info('Active server started');
				const address = server.address();
				if (typeof address == 'object' && address !== null) {
					let port = address.port;
					let p1 = Math.floor(port / 256);
					let p2 = port % 256;

					const localAddress = _this.tlsSocket && _this.tlsSocket.localAddress ? _this.tlsSocket.localAddress : _this.socket.localAddress;
					let ip = localAddress.split('.').join(',');
					_this.raw('PORT ' + ip + ',' + p1 + ',' + p2)
						.then(function (res) {
							if (res.inRange(200, 299)) {
								resolve(server);
							}
							else {
								if (reject) reject(new FTPError(res));
							}
						})
						.catch(function (err) {
							if (reject) reject(err);
						});
				}
				else {
					if (reject) reject(new FTPError("Can't get Active socket address"));
				}
			});
		});
	}

	/**
	 * Create and emit passive socket
	 * @return {Promise<net.Socket|tls.TLSSocket>}
	 */
	openPassiveSocket(): Promise<net.Socket | tls.TLSSocket> {
		const _this = this;
		return new Promise(async function (resolve, reject: (reason?: any) => void) {
			const popts = await _this.pasv(true);
			if (_this.debug) console.log("Passive Verbindungsdetails:", { host: popts.host, port: popts.port });

			const socket = new net.Socket();

			socket.connect(popts.port, popts.host, async function () {
				if (_this.debug) console.log("Unverschlüsselte Datenkanal-Verbindung hergestellt");
				if (_this.useTLSDataChannel && _this.tlsSocket) {
					const tlsSocket = tls.connect(Object.assign({}, _this.tlsOptions, {
						socket,
						session: _this.tlsSocket!.getSession()
					}))

					tlsSocket.on("error", (err) => {
						if (_this.debug) console.error("TLS-Fehler (Datenkanal):", err.message);
						tlsSocket.destroy();
						reject(err);
					});

					if (_this.transferTimeout) {
						tlsSocket.setTimeout(_this.transferTimeout, () => {
							reject(new Error("TLS-Datenkanal: Timeout"));
							tlsSocket.destroy();
						});
					}

					resolve(tlsSocket);
				}
				else {
					resolve(socket);
				}
			});

			socket.on("error", (err) => {
				if (_this.debug) console.error("Datenkanal-Fehler:", err.message);
				socket.destroy();
				reject(err);
			});

			socket.on("close", () => {
				if (_this.debug) console.log("Datenkanal-Verbindung geschlossen");
			});

			if (_this.transferTimeout) {
				socket.setTimeout(_this.transferTimeout, () => {
					if (_this.debug) console.error("Datenkanal: Timeout");
					reject(new Error("Datenkanal: Timeout"));
					socket.destroy();
				});
			}
		});
	}


	/**
	 * Run command and open data channel
	 * @param {string} cmd
	 * @return {Promise<Response>}
	 */
	rawTransfer(cmd: string) : Promise<Response|undefined> {
		const _this = this;
		return new Promise(function(resolve, reject) {
			let TransferRes: Response | undefined;
			let socketEnd = false;

			if (_this.active) {
				_this.openActiveSocket()
					.then(function(server) {
						// Data connection timeout
						let timeout = setTimeout(function () {
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
									_this.getResponseListner(0).waitLast()
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
						let ConnRes : ResponseList | Response | undefined;
						dataSocket.on('end', function () {
							socketEnd = true;
							if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
						});

						_this.getResponseListner(0).waitUntil('150')
							.then(function (cres) {
								ConnRes = cres.getByCode(150);
							})
							.catch(function (err) {
								reject(err);
							})
						;

						const ConnListener1 = _this.getResponseListner(0);
						const ConnListener2 = _this.getResponseListner(0);
						const TransferResListener = _this.getResponseListner(0);

						ConnListener1.waitUntil('150')
							.then(function (cres) {
								ConnRes = cres.getByCode(150);
								if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
							})
							.catch(function (err) {
								ConnListener1.stop();
								ConnListener2.stop();
								TransferResListener.stop();
								reject(err);
							})
						;

						ConnListener2.waitUntil('125')
							.then(function (cres) {
								ConnRes = cres.getByCode(125);
								if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
							})
							.catch(function (err) {
								ConnListener1.stop();
								ConnListener2.stop();
								TransferResListener.stop();
								reject(err);
							})
						;

						TransferResListener.waitUntil('226')
							.then(function (cres) {
								TransferRes = cres.getByCode(226);
								if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
							})
							.catch(function (err) {
								ConnListener1.stop();
								ConnListener2.stop();
								TransferResListener.stop();
								reject(err);
							})
						;

						/*_this.getResponseListner(0).wait()
							.then(function (cres) {
								//if (cres.getByCode(150)) ConnRes = cres.getByCode(150);
								if (cres.getByCode(125)) ConnRes = cres.getByCode(125);
								if (cres.getByCode(226)) TransferRes = cres.getByCode(226);
								if (ConnRes && TransferRes && socketEnd) resolve(TransferRes);
							})
							.catch(function (err) {
								reject(err);
							})
						;*/

						_this.emit('datachannel', dataSocket);

						_this.raw(cmd)
							.then(function (res) {
								if (res.isSuccess()) {
									_this.getResponseListner(0).wait()
										.then(function (cres) {
											if (cres.getByCode(150)) ConnRes = cres.getByCode(150);
											if (cres.getByCode(226)) TransferRes = cres.getByCode(226);
											if (ConnRes && TransferRes && socketEnd) {
												resolve(TransferRes);
											}
											//else resolve(undefined);
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
	 * @return {Promise<ResponseList>}
	 */
	async quit(): Promise<ResponseList> {
		const res = await this.raw('QUIT');
		if (res.isSuccess()) return res;
		throw new FTPError(res);
	}

	/**
	 * Run command and read from data channel
	 * @param cmd
	 */
	rawDataChannel(cmd: string) : Promise<string> {
		const _this = this;
		return new Promise(function(resolve, reject) {
			let rawData = '';
			let error : Error | null = null;
			if (!cmd || (cmd+'').length == 0) reject(new Error('Invalid command: '+cmd));

			_this.once('datachannel', function (dataSocket) {
				dataSocket.on('data', function (chunk: string) {
					rawData += chunk;
				});

				dataSocket.on('error', function (err : Error) {
					error = err;
				});
			});

			_this.rawTransfer(cmd)
				.then(function () {
					if (error) reject(error);
					else resolve(rawData);
				})
				.catch(function (err) {
					reject(err);
				})
		});
	}

	/**
	 * Get file list from FTP
	 * @param {string} dir
	 * @return {Promise<string>}
	 */
	rawlist(dir?:string): Promise<string> {
		if (!dir) dir = '.'
		return this.rawDataChannel('LIST ' + dir);
	}

	/**
	 * Get file list from FTP
	 * @param {string} dir
	 * @return {Promise<string>}
	 */
	rawMlsd(dir?:string): Promise<string> {
		if (!dir) dir = '.'
		return this.rawDataChannel('MLSD ' + dir);
	}



	/**
	 * Get file list from FTP
	 * @param {string} dir
	 * @return {Promise<[{}]>}
	 */
	async list (dir?: string) : Promise<ListEntry[]> {
		let data: string;
		let features = await this.feat();
		if (!this.MLSTSend) {
			if (features.has("MLST")) {
				try {
					let mlst_res = await this.raw("OPTS MLST type;size;modify;unique;unix.mode;unix.owner;unix.group;unix.ownername;unix.groupname;");
					if (this.debug) console.info("OPTS MLST ... result: " + mlst_res.toString());
				} catch (e) {}
				this.MLSTSend = true;
			}
			else {
				this.MLSTSend = false;
			}
		}

		//console.info(features.get("MLST"));

		if (features.has("MLSD")) {
			try {
				data = await this.rawMlsd(dir);
				return parseMlsdOutput(data);
			} catch (e) {
				if (this.debug) console.warn(e);
			}
		}
		data = await this.rawlist(dir);
		return parseListOutput(data);
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Upload file to Server
	 * @param {string|module:stream.Readable} src
	 * @param {string} [dst]
	 * @return {Promise<void>}
	 */
	async put(src : string | stream.Readable, dst?: string) : Promise<void> {
		//const _this = this;
		let readStream : stream.Readable;

		if (src instanceof stream.Readable) {
			readStream = src;
		}
		else {
			if (this.transferEncoding) {
				readStream = fs.createReadStream(src, {encoding: this.transferEncoding});
			}
			else {
				readStream = fs.createReadStream(src);
			}
		}

		let error : Error|null = null;
		readStream.on('error', function (err) {
			error = err;
		});

		this.once('datachannel', function (dataSocket) {
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

		const res = await this.rawTransfer('STOR '+dst);
		if (error) throw error;
		else if (res && res.isError()) throw new FTPError(res);
		else if (!res) throw new FTPError("No response");
	}

	/**
	 * Download file from Server
	 * @param {string} src
	 * @param {string} [dst]
	 * @return {Promise<void>}
	 */
	get(src : string, dst? : string | stream.Writable) : Promise<void> {
		const _this = this;
		return new Promise(function(resolve, reject) {
			let writeStream : stream.Writable;
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

			let error : Error;
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
					else if (res && res.isError()) reject(new FTPError(res));
					else if (!res) reject(new FTPError("No response"));
					else resolve();
				})
				.catch(function (err) {
					reject(err);
				})
			;
		});
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Change to directory
	 * @param {string} dir
	 * @return {Promise<ResponseList>}
	 */
	async cwd (dir : string) : Promise<ResponseList> {
		const res = await this.raw('CWD '+(dir))
		if (res.isSuccess()) return res;
		else throw new FTPError(res);
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Get current path
	 * @return {Promise<string>}
	 */
	async pwd () : Promise<string> {
		const res = await this.raw('PWD');
		if (res.isSuccess()) {
			const data = res.toString();
			const start = data.indexOf('"');
			if (start < 0) throw new FTPError(res);
			const ende = data.indexOf('"', start+1);
			if (ende < 0) throw new FTPError(res);

			return data.substring(start+1, ende);
		}
		else throw new FTPError(res);
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Get current path
	 * @param {string} src
	 * @param {string} dst
	 * @return {Promise<ResponseList>}
	 */
	async rename(src : string, dst : string) : Promise<ResponseList> {
		let res = await this.raw('RNFR '+src);
		if (res.isSuccess()) {
			res = await this.raw('RNTO '+dst);
			if (res.isSuccess()) return res;
			else throw new FTPError(res)
		}
		else throw new FTPError(res);
	};

	/**
	 * Remove file
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	async delete (target : string) : Promise<ResponseList> {
		const res = await this.raw('DELE '+(target));
		if (res.isSuccess()) return res;
		else throw new FTPError(res);
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Remove file
	 * @see this.delete
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	rm (target : string) : Promise<ResponseList> { return this.delete(target); }

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Create a directory
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	async mkdir (target : string) : Promise<ResponseList> {
		const res = await this.raw('MKD '+(target));
		if (res.isSuccess()) return res;
		else throw new FTPError(res);
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * delete file
	 * @param {string} target
	 * @return {Promise<ResponseList>}
	 */
	async rmdir (target : string) : Promise<ResponseList> {
		const res = await this.raw('RMD '+(target));
		if (res.isSuccess()) return res;
		else throw new FTPError(res);
	};

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Get current path
	 * @return {Promise<ResponseList>}
	 */
	async stat (): Promise<ResponseList> {
		const res = await this.raw('STAT')
		if (res.isSuccess()) return res;
		else throw new FTPError(res);
	};
}
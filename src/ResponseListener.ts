import {ResponseList} from "./ResponseList";
import {Socket} from "net";
import {TLSSocket} from "tls";
import {Response} from "./Response";

export class ResponseListener {
	public completed: boolean = false;
	private socket: Socket | TLSSocket;
	private resultTimeout: number = 0;
	private timer: NodeJS.Timeout|null = null;
	private reject: ((err: Error) => void) | null = null;
	private resolve: ((value: ResponseList) => void) | null = null;
	private match?: string|RegExp;
	public data = "";

	constructor(socket: Socket | TLSSocket, resultTimeout: number = 10000) {
		this.socket = socket;
		this.resultTimeout = resultTimeout;

		// Bindet alle Methoden explizit an die Klasseninstanz
		this._err_fn = this._err_fn.bind(this);
		this._close_fn = this._close_fn.bind(this);
		this._off_fn = this._off_fn.bind(this);
		this._data_fn = this._data_fn.bind(this);
		this._append_data = this._append_data.bind(this);
		this._data_until_fn = this._data_until_fn.bind(this);
	}

	_err_fn (err: Error) {
		if (this.timer) clearTimeout(this.timer);
		this._off_fn();
		if (!this.completed) {
			this.completed = true;
			this.reject!(err);
		}
	};

	_close_fn () {
		if (this.timer) clearTimeout(this.timer);
		this._off_fn();
		if (!this.completed) {
			this.completed = true;
			this.reject!(new Error('The connection was closed before the response was sent'));
		}
	};

	_append_data (chunk: string) {
		let lines = chunk.split("\r\n");
		for (let i=0; i < lines.length; i++) {
			if (lines[i] !== '' && lines[i].substring(0, 3) !== '220')
				this.data += lines[i]+"\r\n";
		}
	};

	_data_fn (chunk: string) {
		if (this.timer) clearTimeout(this.timer);
		this._off_fn();
		if (!this.completed) {
			this._append_data(chunk);
			if (this.data.trim() !== '') {
				this.completed = true;
				this.resolve!(new ResponseList(this.data));
			}
		}
	};

	_data_until_fn (chunk: string) {
		if (!this.completed) {
			this._append_data(chunk);

			let matched = false;
			if (this.match instanceof RegExp) {
				matched = this.match.test(this.data);
			}
			else if (this.data.indexOf(this.match!) > -1) {
				matched = true;
			}

			if (matched) {
				if (this.timer) clearTimeout(this.timer);
				this._off_fn();
				this.completed = true;
				this.resolve!(new ResponseList(this.data));
			}
		}
	};

	_off_fn () {
		this.socket.off('error', this._err_fn);
		this.socket.off('close', this._close_fn);
		this.socket.off('data', this._data_fn);
		this.socket.off('data', this._data_until_fn);
	};

	/**
	 * Get response from control channel
	 * @return {Promise<ResponseList>}
	 */
	wait () : Promise<ResponseList> {
		const _this = this;
		return new Promise(function(resolve, reject) {
			_this.resolve = resolve;
			_this.reject = reject;
			_this.socket.once('error', _this._err_fn);
			_this.socket.once('close', _this._close_fn);
			_this.socket.on('data', _this._data_fn);

			if (_this.resultTimeout > 0) {
				_this.timer = setTimeout(function () {
					if (!_this.completed) {
						_this.completed = true;
						reject(new Error('Waiting for response timeout ('+(_this.resultTimeout / 1000)+'sec)'));
					}
				}, _this.resultTimeout);
			}
		});
	}

	async waitLast () : Promise<Response|undefined> {
		const list = await this.wait();
		return list.pop();
	}

	/**
	 * Get multi-line response from control channel
	 * @param {string|RegExp} matchEnd match end string
	 * @return {Promise<ResponseList>}
	 */
	waitUntil(matchEnd: string|RegExp) : Promise<ResponseList> {
		this.match = matchEnd
		const _this = this;
		return new Promise(function(resolve, reject) {
			_this.resolve = resolve;
			_this.reject = reject;
			_this.socket.once('error', _this._err_fn);
			_this.socket.once('close', _this._close_fn);
			_this.socket.on('data', _this._data_until_fn);

			if (_this.resultTimeout > 0) {
				_this.timer = setTimeout(function () {
					if (!_this.completed) {
						_this.completed = true;
						reject(new Error('Waiting for response timeout ('+(_this.resultTimeout / 1000)+'sec)'));
					}
				}, _this.resultTimeout);
			}
		});
	};

	stop () {
		this._off_fn();
	}
}
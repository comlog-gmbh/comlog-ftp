import {Response} from "./Response";
import {ResponseList} from "./ResponseList";

export class FTPError extends Error {
	code = null;

	/**
	 * Create new FTP Error
	 * @param {string|Response} message
	 * @param {number|null} [code]
	 */
	constructor(message?: any, code?: any) {
		super();

		// Parsed response
		if (message instanceof Response) {
			code = message.code;
			message = message.message;
		}

		// Promiese list
		if (message instanceof ResponseList) {
			var lastError = null;
			for (var i=0; i < message.length; i++) {
				if (message[i].isError()) lastError = message[i];
			}
			code = lastError.code;
			message = message.toString();
		}

		// plain message
		if (!code) {
			code = message.substr(0, 3);
			if (!isNaN(code)) message = message.substr(3);
			else code = null;
		}

		if (message) this.message = message;
		if (code) this.code = code;
	}

	toString() {
		var res = 'Error: ';
		if (this.code) res += this.code+' ';
		res += this.message;
		return res;
	}
}
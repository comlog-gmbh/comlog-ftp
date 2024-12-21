import {Response} from "./Response";
import {ResponseList} from "./ResponseList";

export class FTPError extends Error {
	code: number|null = null;

	/**
	 * Create new FTP Error
	 * @param {string|Response} message
	 * @param {number|null} [code]
	 */
	constructor(message?: string|ResponseList|Response, code?: number|null) {
		super();

		// Parsed response
		if (message instanceof Response) {
			code = message.code;
			message = message.message ? message.message : 'No message defined';
		}

		// Promise list
		if (message instanceof ResponseList) {
			let lastError = null;
			for (let i=0; i < message.length; i++) {
				if (message[i].isError()) lastError = message[i];
			}
			code = lastError && lastError.code ? lastError.code : null;
			message = message.toString();
		}

		// plain message
		if (!code) {
			message = message + '';
			let codeStr = message.substring(0, 3);
			if (!isNaN(Number(codeStr))) {
				code = parseInt(codeStr);
				message = message.substring(3);
			}
			else code = null;
		}

		if (message) this.message = message;
		if (code) this.code = code;
	}

	toString() {
		let res = 'Error: ';
		if (this.code) res += this.code+' ';
		res += this.message;
		return res;
	}
}
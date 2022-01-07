import {Response} from "./Response";

export class ResponseList extends Array {
	/**
	 * Create responselist
	 * @param {string|array} data
	 */
	constructor(data? : any) {
		super();
		if (typeof data == 'string') {
			var lines = (data+'').split("\r\n").join("\n").split("\r").join("\n").split("\n");
			for (var i=0; i < lines.length; i++) {
				if (lines[i] !== '') this.push(new Response(lines[i]));
			}
		}
		else if (Array.isArray(data)) {
			for (var i=0; i < data.length; i++) {
				if (data[i]) this.push(new Response(data[i]));
			}
		}
	}

	/**
	 * All response lines are success
	 * @return {boolean}
	 */
	isSuccess () {
		var success = true;
		for (var i=0; i < this.length; i++) {
			if (!this[i].isSuccess()) {
				success = false;
				break;
			}
		}

		return success;
	}

	/**
	 * All response codes in range
	 * @param from
	 * @param to
	 * @return {boolean}
	 */
	inRange (from: number, to?: number) {
		var success = true;
		for (var i=0; i < this.length; i++) {
			if (!this[i].inRange(from, to)) {
				success = false;
				break;
			}
		}

		return success;
	}

	/**
	 * Any of lines has error
	 * @return {boolean}
	 */
	isError () {
		return !this.isSuccess();
	};

	toString() {
		var out = '';
		for (var i=0; i < this.length; i++) {
			out = this[i].code + ' ' + this[i].message + "\r\n";
		}
		return out;
	}

	/**
	 * Check if code in ResponseList
	 * @param {number} code
	 * @return {boolean}
	 */
	codeExists(code: any) {
		code = parseInt(code);
		for (var i=0; i < this.length; i++) {
			if (this[i].code === code) return true;
		}

		return false;
	}

	/**
	 * Get response by code
	 * @param {number} code
	 * @return {null|Response}
	 */
	getByCode(code: any) {
		code = parseInt(code);
		for (var i=0; i < this.length; i++) {
			if (this[i].code === code) return this[i];
		}

		return null;
	}
}
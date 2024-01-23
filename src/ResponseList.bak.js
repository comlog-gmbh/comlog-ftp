const Response = require("./Response");

class ResponseList extends Array {
	/**
	 *
	 * @param {String} data
	 */
	constructor(data) {
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
	inRange (from, to) {
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
		return !this.allIsSuccess();
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
	 * @param code
	 * @return {boolean}
	 */
	codeExists(code) {
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
	getByCode(code) {
		code = parseInt(code);
		for (var i=0; i < this.length; i++) {
			if (this[i].code === code) return this[i];
		}

		return null;
	}
}

module.exports = ResponseList;
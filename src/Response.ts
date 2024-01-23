// @ts-ignore
export class Response {
	code = null;
	message = null;

	constructor(data?: any) {
		if (data) {
			var code = (data+'').substr(0,3);
			if (Number.isNaN(code)) {
				// @ts-ignore
				this.message = "Can't parse response:" + data;
			}
			else {
				// @ts-ignore
				this.code = parseInt(code);
				this.message = data.substr(4);
			}
		}
		else {
			// @ts-ignore
			this.code = 700
			// @ts-ignore
			this.message = "Can't parse response:" + data;
		}
	}

	/**
	 * Check code in range
	 * @param {number} from
	 * @param {number} [to]
	 * @return {boolean}
	 */
	inRange (from: number, to?: number) {
		if (!to) to = from;
		if (typeof this.code != 'number') return false;

		return this.code >= from && this.code <= to;
	}

	/**
	 * Check is response positive
	 * @return {boolean}
	 */
	isSuccess () {
		return this.inRange(100, 399);
	}

	/**
	 * Check is response negative
	 * @return {boolean}
	 */
	isError () {
		return this.inRange(400, 700);
	}

	toString () {
		return this.code + ' ' + this.message;
	}

	match (regexp: RegExp) {
		return this.toString().match(regexp);
	}
}
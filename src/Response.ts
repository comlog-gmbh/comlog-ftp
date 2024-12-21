export class Response {
	code: number|null = null;
	message: string|null = null;

	constructor(data?: any) {
		if (data) {
			const code = (data+'').substring(0,3);
			if (isNaN(Number(code))) {
				this.message = "Can't parse response:" + data;
			}
			else {
				this.code = parseInt(code);
				this.message = data.substring(4);
			}
		}
		else {
			this.code = 700
			this.message = "Can't parse response:" + data;
		}
	}

	/**
	 * Check code in range
	 * @param {number} from
	 * @param {number} [to]
	 * @return {boolean}
	 */
	inRange (from: number, to?: number): boolean {
		if (!to) to = from;
		if (typeof this.code != 'number') return false;

		return this.code >= from && this.code <= to;
	}

	/**
	 * Check is response positive
	 * @return {boolean}
	 */
	isSuccess (): boolean {
		return this.inRange(100, 399);
	}

	/**
	 * Check is response negative
	 * @return {boolean}
	 */
	isError (): boolean {
		return this.inRange(400, 700);
	}

	toString (): string {
		return this.code + ' ' + this.message;
	}

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Regexp Validation
	 * @param regexp
	 */
	match (regexp: RegExp): RegExpMatchArray|null {
		return this.toString().match(regexp);
	}
}
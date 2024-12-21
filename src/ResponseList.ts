import {Response} from "./Response";

const regex = /(?=\n\d+\s)/g;

export class ResponseList extends Array<Response> {
	/**
	 * Create ResponseList
	 * @param {string|array} data
	 */
	constructor(data? : any) {
		super();
		if (typeof data == 'string') {
			let lines = data.split(regex).map(part => part.trim());

			//let lines = (data+'').split("\r\n").join("\n").split("\r").join("\n").split("\n");
			for (let i=0; i < lines.length; i++) {
				if (lines[i] !== '') this.push(new Response(lines[i]));
			}
		}
		else if (Array.isArray(data)) {
			for (let i=0; i < data.length; i++) {
				if (data[i]) this.push(new Response(data[i]));
			}
		}
	}

	/**
	 * All response lines are success
	 * @return {boolean}
	 */
	isSuccess (): boolean {
		let success = true;
		for (let i=0; i < this.length; i++) {
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
	inRange (from: number, to?: number): boolean {
		let success = true;
		for (let i=0; i < this.length; i++) {
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
	isError (): boolean {
		return !this.isSuccess();
	};

	toString(): string {
		let out = '';
		for (let i=0; i < this.length; i++) {
			out += this[i].code + ' ' + this[i].message + "\r\n";
		}
		return out;
	}

	/**
	 * Check if code in ResponseList
	 * @param {number} code
	 * @return {boolean}
	 */
	codeExists(code: any): boolean {
		code = parseInt(code);
		for (let i=0; i < this.length; i++) {
			if (this[i].code === code) return true;
		}

		return false;
	}

	/**
	 * Get response by code
	 * @param {number} code
	 * @return {Response|undefined}
	 */
	getByCode(code: any): Response | undefined {
		code = parseInt(code);
		for (let i=0; i < this.length; i++) {
			if (this[i].code === code) return this[i];
		}

		return undefined;
	}
}
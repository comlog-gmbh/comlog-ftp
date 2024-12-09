export type ListEntry = {
	type: string;
	permissions?: string;
	owner?: string;
	group?: string;
	size: number;
	date: string;
	name: string
};

/**
 * Zeile eines Unix-Listeneintrags parsen
 * @param entry
 */
export function parseUnixListEntry(entry: string): ListEntry {
	const regex = /^([\-dlg]{1,2})([rwx\-]{9})\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+(?:\d{4}|\d{2}:\d{2}))\s+(.+)$/;

	const match = entry.match(regex);
	if (!match) {
		throw new Error(`Ungültiger UNIX-Listeneintrag: ${entry}`);
	}

	return {
		type: match[1].startsWith("d")
			? "directory"
			: match[1].startsWith("l")
				? "symlink"
				: "file",
		permissions: match[2],
		owner: match[3],
		group: match[4],
		size: parseInt(match[5], 10),
		date: match[6],
		name: match[7],
	};
}



/**
 * Zeile eines Windows-Listeneintrags parsen
 * @param entry
 */
export function parseWindowsListEntry(entry: string): ListEntry {
	const regex = /^(\d{2}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(AM|PM))\s+(<DIR>|\d+)\s+(.+)$/;

	const match = entry.match(regex);
	if (!match) {
		throw new Error(`Ungültiger Windows-Listeneintrag: ${entry}`);
	}

	return {
		type: match[4] === "<DIR>" ? "directory" : "file",
		size: match[4] === "<DIR>" ? 0 : parseInt(match[4], 10),
		date: `${match[1]} ${match[2]}`, // Umwandlung in ein echtes Datum später möglich
		name: match[5],
	};
}

/**
 * Zeile eines Listeneintrags parsen
 * @param entry
 */
export function parseListEntry(entry: string): ListEntry {
	try {
		return parseUnixListEntry(entry);
	} catch (err) {
		try {
			return parseWindowsListEntry(entry);
		} catch (err) {
			throw new Error(`Unbekanntes Listeneintragsformat: ${entry}`);
		}
	}
}

/**
 * Liste parsen
 * @param output
 */
export function parseListOutput(output: string): ListEntry[] {
	return output.split("\r\n").join("\n").split("\r").join("\n").split("\n")
		.filter(line => line.trim() !== "") // Leere Zeilen ignorieren
		.map(parseListEntry); // Jede Zeile parsen
}
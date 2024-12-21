export type ListEntry = {
	type: "directory"|"symlink"|"file";
	permissions?: string;
	permissionsOctal?: string;
	owner?: string;
	group?: string;
	size: number;
	date: string;
	dateObject?: Date;
	name: string
};

function blockToOctal(block: string) {
	let value = 0;
	if (block[0] === 'r') value += 4; // Read
	if (block[1] === 'w') value += 2; // Write
	if (block[2] === 'x') value += 1; // Execute
	return value;
}

function permissionsToOctal(permissions: string) {
	// Entferne das erste Zeichen (Dateityp wie d, -, l)
	const userBlock = permissions.substring(0, 3); // Benutzerrechte
	const groupBlock = permissions.substring(3, 6); // Gruppenrechte
	const othersBlock = permissions.substring(6, 9); // Andere Rechte
	return `${blockToOctal(userBlock)}${blockToOctal(groupBlock)}${blockToOctal(othersBlock)}`;
}

function formatMLSTDate(mlstDate: string): string {
	const year = mlstDate.slice(0, 4);
	const month = mlstDate.slice(4, 6);
	const day = mlstDate.slice(6, 8);
	const hours = mlstDate.slice(8, 10);
	const minutes = mlstDate.slice(10, 12);
	const seconds = mlstDate.slice(12, 14);

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}


const unixListRegexp1 = /^([\-dlg]{1,2})([rwx\-]{9})\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+(?:\d{4}|\d{2}:\d{2}))\s+(.+)$/;
const unixListRegexp2 = /^([d-]{1,2})([rwx-]{9})\s+(\d+)\s+(\S*)\s+(\S*)\s+(\d+)\s+([A-Za-z]{3})\s+(\d{2})\s+(\d{2}:\d{2})\s+(.+)$/
;
/**
 * Zeile eines Unix-Listeneintrags parsen
 * @param entry
 */
export function parseUnixListEntry(entry: string): ListEntry {
	let match = entry.match(unixListRegexp1);
	if (match) {
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
	else {
		match = entry.match(unixListRegexp2);
		if (match) {
			return {
				type: match[1].startsWith("d")
					? "directory"
					: match[1].startsWith("l")
						? "symlink"
						: "file",
				permissions: match[2],
				owner: match[4],
				group: match[5],
				size: parseInt(match[6], 10),
				date: match[7] + ' ' + match[8] + ' ' + match[9],
				name: match[10],
			};
		}
		else {
			throw new Error(`Ungültiger UNIX-Listeneintrag: ${entry}`);
		}
	}
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
	let result: ListEntry;
	try {
		result = parseUnixListEntry(entry);
	} catch (err) {
		try {
			result = parseWindowsListEntry(entry);
		} catch (err) {
			throw new Error(`Unbekanntes Listeneintragsformat: ${entry}`);
		}
	}

	// Liste optimieren
	if (result.permissions) {
		result.permissionsOctal = permissionsToOctal(result.permissions);
	}

	return result;
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

/**
 * Liste (MLSD) parsen
 * @param output
 */
export function parseMlsdOutput(output: string): ListEntry[] {
	const lines = output.split("\r\n").join("\n").split("\r").join("\n").split("\n");
	return lines
		.map(line => {
			if (!line.trim()) return null; // Überspringe leere Zeilen

			// Aufteilen in Metadaten und Dateiname
			const [metadataPart, name] = line.includes("; ")
				? line.split("; ").map(part => part.trim())
				: [line, ""];

			const metadata: Record<string, string | number> = {};
			metadataPart.split(";").forEach(pair => {
				const [key, value] = pair.split('=');
				if (key && value) {
					metadata[key] = isNaN(+value) ? value : parseInt(value, 10);
				}
			});

			// Ermitteln des Typs
			let type: "directory" | "symlink" | "file" = "file";
			if (metadata.Type === "dir") {
				type = "directory";
			} else if (metadata.Type === "link") {
				type = "symlink";
			}

			// Konvertieren des Datums (falls Modify vorhanden)
			let date = metadata.Modify ? metadata.Modify + '' : '';
			if (date.length === 14) {
				const year = date.slice(0, 4);
				const month = date.slice(4, 6);
				const day = date.slice(6, 8);
				const hours = date.slice(8, 10);
				const minutes = date.slice(10, 12);
				const seconds = date.slice(12, 14);
				date = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
			} else {
				date = '';
			}

			const dateObject = date ? new Date(date.replace(" ", "T")) : null;

			return {
				type,
				size: metadata.Size as number,
				date,
				dateObject,
				name,
				permissions: metadata.Perm ?? undefined,
				permissionsOctal: metadata.Perm ? permissionsToOctal(metadata.Perm as string) : undefined,
				user: metadata['Unix.owner'] ?? undefined,
				group: metadata['Unix.group'] ?? undefined,
			};
		})
		.filter(entry => entry !== null) as ListEntry[]; // Entferne ungültige Einträge
}

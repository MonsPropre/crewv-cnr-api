export async function checkCrew(text) {

	const pattern =
		/\[\s*([^\]]+?)\s*]\s*.+|.+\s*\[\s*([^\]]+?)\s*]|([^|\[\]\s]+)\s*\|\s*.+|([^|\[\]\s]+)\s+[xX]\s+.+/i;

	const match = text.match(pattern);
	let crewName = null;

	if (match) {
		if (match[1]) {
			crewName = match[1].toUpperCase();
		} else if (match[2]) {
			crewName = match[2].toUpperCase();
		} else if (match[3]) {
			crewName = match[3].toUpperCase();
		} else if (match[4]) {
			crewName = match[4].toUpperCase();
		}
	}

	return {
		text,
		crewName: crewName,
		Username: text.trim()
	};
}

export default checkCrew;
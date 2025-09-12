import path from "path";
import chalk from "chalk";
import { fileURLToPath } from 'url';

function formatSegment(segment, {fileUpperCase, fileCapitalized}) {
	if (fileUpperCase) {
		return segment.toUpperCase();
	} else if (fileCapitalized && segment.length > 0) {
		return segment[0].toUpperCase() + segment.slice(1);
	}
	return segment;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPrefix({
					   showDate,
					   showFile,
					   showRelativePath,
					   fileUpperCase,
					   fileCapitalized,
					   projectRoot,
					   loggerFile
				   }) {
	let prefix = '';

	// Date/Time - toujours sûr
	if (showDate) {
		try {
			const pad = n => n.toString().padStart(2, '0');
			const now = new Date();
			const date = `${pad(now.getDate())}/${pad(now.getMonth() + 1)} - ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
			prefix += `[${date}]`;
		} catch (e) {
			prefix += `[${new Date().toLocaleTimeString()}]`;
		}
	}

	// File path - peut échouer, donc isolé
	if (showFile) {
		try {
			const stack = new Error().stack.split('\n');
			let callerLine = stack.find(line =>
				line.includes('(') &&
				!line.includes(loggerFile)
			);
			if (!callerLine) callerLine = stack[2] || '';

			// Extraire le chemin du fichier de la stack trace
			const match = callerLine.match(/\((.*):\d+:\d+\)/) || callerLine.match(/at (.*):\d+:\d+/);
			let filePath = match ? match[1] : "unknown";

			// Convertir les URLs file:// en chemins normaux
			if (filePath.startsWith('file://')) {
				try {
					filePath = fileURLToPath(filePath);
				} catch (error) {
					// Si la conversion échoue, essayer de nettoyer manuellement
					filePath = filePath.replace('file://', '').replace(/^\/+/, '/');
				}
			}

			let fileDisplay;

			if (showRelativePath) {
				try {
					// Calculer le chemin relatif par rapport au projet
					let relPath = path.relative(projectRoot, filePath);

					// Si le chemin est vide ou égal au nom du fichier, utiliser juste le nom
					if (!relPath || relPath === path.basename(filePath)) {
						relPath = path.basename(filePath);
					}

					fileDisplay = relPath
						.split(path.sep)
						.map(seg => formatSegment(seg, {fileUpperCase, fileCapitalized}))
						.join(path.sep);
				} catch (e) {
					fileDisplay = path.basename(filePath);
				}
			} else {
				try {
					let file = path.basename(filePath);
					file = formatSegment(file, {fileUpperCase, fileCapitalized});
					fileDisplay = file;
				} catch (e) {
					fileDisplay = 'unknown';
				}
			}

			prefix += (prefix ? ' ' : '') + `[${fileDisplay}]`;
		} catch (e) {
			// Si tout échoue pour le fichier, on ajoute quand même quelque chose
			prefix += (prefix ? ' ' : '') + '[file-error]';
		}
	}

	return prefix;
}

export function initLogger({
							   enabled = true,
							   showDate = true,
							   showFile = true,
							   showRelativePath = false,
							   fileUpperCase = false,
							   fileCapitalized = true,
							   enableLog = true,
							   enableError = true
						   } = {}) {
	if (!enabled) return;
	const origLog = console.log;
	const origError = console.error;
	const projectRoot = process.cwd();
	const loggerFile = path.basename(__filename);

	function customLog(origFn, ...args) {
		let prefix;
		try {
			prefix = getPrefix({
				showDate,
				showFile,
				showRelativePath,
				fileUpperCase,
				fileCapitalized,
				projectRoot,
				loggerFile
			});
		} catch (e) {
			// Fallback minimal si tout échoue
			const time = new Date().toLocaleTimeString();
			prefix = `[${time}] [log-error]`;
		}

		origFn(`${chalk.hex("#a9a9a9")(prefix)}`, ...args);
	}

	if (enableLog) {
		console.log = function (...args) {
			customLog(origLog, ...args);
		};
	}

	if (enableError) {
		console.error = function (...args) {
			customLog(origError, ...args);
		};
	}
}

export default initLogger;
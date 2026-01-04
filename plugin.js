/**
 * Markdown Importer Plugin for Thymer
 * Creates formatted notes from markdown in your clipboard
 * Version: 0.0.1
 */

class Plugin extends AppPlugin {
	onLoad() {
		this.ui.addCommandPaletteCommand({
			label: "Paste Markdown as Notes",
			icon: "clipboard-text",
			onSelected: () => this.pasteMarkdown(),
		});
	}

	async pasteMarkdown() {
		try {
			const text = await navigator.clipboard.readText();
			if (!text || text.trim().length === 0) {
				this.ui.addToaster({
					title: "Clipboard is empty",
					message: "Copy some markdown text first!",
					dismissible: true,
				});
				return;
			}

			const activePanel = this.ui.getActivePanel();
			const activeRecord = activePanel ? activePanel.getActiveRecord() : null;

			if (activeRecord) {
				await this.pasteIntoNote(activeRecord, text);
				this.ui.addToaster({
					title: "Paste Complete",
					message: "Markdown pasted into current note.",
					dismissible: true,
					autoDestroyTime: 3000
				});
			} else {
				const sections = this.splitByH1(text);
				let createdGuids = [];
				for (const section of sections) {
					const guid = await this.createNoteFromMarkdown(section.title, section.body);
					if (guid) createdGuids.push(guid);
				}

				if (createdGuids.length > 0 && activePanel) {
					activePanel.navigateTo({
						type: 'record',
						rootId: createdGuids[0],
						subId: null,
						workspaceGuid: this.getWorkspaceGuid()
					});
				}

				this.ui.addToaster({
					title: "Import Complete",
					message: `Created ${createdGuids.length} note${createdGuids.length !== 1 ? 's' : ''} from clipboard.`,
					dismissible: true,
					autoDestroyTime: 4000
				});
			}

		} catch (err) {
			console.error("Paste failed", err);
			this.ui.addToaster({
				title: "Paste Failed",
				message: (err && err.message) || "Could not read clipboard.",
				dismissible: true,
			});
		}
	}

	splitByH1(text) {
		const lines = text.split(/\r?\n/);
		const sections = [];
		let currentTitle = "New Note";
		let currentBody = [];
		let firstHeaderFound = false;

		for (const line of lines) {
			const h1Match = line.match(/^#\s+(.+)/);
			if (h1Match) {
				if (firstHeaderFound || currentBody.length > 0) {
					if (firstHeaderFound || currentBody.some(l => l.trim().length > 0)) {
						sections.push({ title: currentTitle, body: currentBody.join('\n') });
					}
				}
				currentTitle = h1Match[1].trim();
				currentBody = [];
				firstHeaderFound = true;
			} else {
				currentBody.push(line);
			}
		}

		if (sections.length === 0 && !firstHeaderFound) {
			sections.push({ title: "Imported Note", body: text });
		} else {
			sections.push({ title: currentTitle, body: currentBody.join('\n') });
		}

		return sections;
	}

	async pasteIntoNote(record, markdown) {
		const lines = markdown.split(/\r?\n/);
		let lastItem = null;

		const existingItems = await record.getLineItems();
		if (existingItems && existingItems.length > 0) {
			lastItem = existingItems[existingItems.length - 1];
		}

		await this.addLinesToNote(record, lines, lastItem);
	}

	async createNoteFromMarkdown(title, markdown) {
		const guid = await this.data.createNewRecord(title);
		if (!guid) return null;

		const record = this.data.getRecord(guid);
		if (!record) return null;

		const lines = markdown.split(/\r?\n/);
		await this.addLinesToNote(record, lines, null);

		return guid;
	}


	async addLinesToNote(record, lines, initialLastItem) {
		let insideCodeBlock = false;
		let codeBlockLanguage = null;
		let codeBlockContent = [];

		let parents = [null];
		let lastSiblingAtLevel = [];
		lastSiblingAtLevel[0] = initialLastItem;

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			const trimmed = line.trim();

			// --- Empty Lines ---
			if (trimmed.length === 0) {
				if (!insideCodeBlock) {
					// Create a blank text item instead of 'br' to ensure visible height
					// Note: We use "text" type with empty text. This renders as a blank line.
					const item = await record.createLineItem(null, lastSiblingAtLevel[0], "text");
					if (item) {
						item.setSegments([{ type: "text", text: "" }]);
						lastSiblingAtLevel[0] = item;
						// Preserve context for loose lists
					}
				} else {
					codeBlockContent.push("");
				}
				continue;
			}

			// --- Code Blocks ---
			if (trimmed.startsWith('```')) {
				if (insideCodeBlock) {
					// End block
					const codeText = codeBlockContent.join('\n');
					const item = await record.createLineItem(null, lastSiblingAtLevel[0], "text");
					if (item) {
						item.setSegments([{ type: "text", text: codeText }]);
						item.setHighlightLanguage(codeBlockLanguage || 'plaintext');
						lastSiblingAtLevel[0] = item;
						parents = [null];
						lastSiblingAtLevel.splice(1);
					}
					insideCodeBlock = false;
					codeBlockContent = [];
					codeBlockLanguage = null;
				} else {
					// Start block
					insideCodeBlock = true;
					codeBlockLanguage = trimmed.slice(3).trim() || 'plaintext';
				}
				continue;
			}
			if (insideCodeBlock) {
				codeBlockContent.push(line);
				continue;
			}

			// --- Horizontal Rule ---
			if (trimmed.match(/^(\*{3,}|-{3,}|_{3,})$/)) {
				const item = await record.createLineItem(null, lastSiblingAtLevel[0], "text");
				if (item) {
					item.setSegments([{ type: "text", text: "---" }]);
					lastSiblingAtLevel[0] = item;
					parents = [null];
					lastSiblingAtLevel.splice(1);
				}
				continue;
			}

			// --- Indentation / Nesting Calculation ---
			const leadingSpacesMatch = line.match(/^\s*/);
			const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[0].length : 0;
			const indentLevel = Math.floor(leadingSpaces / 2);

			let validLevel = indentLevel;
			if (validLevel >= parents.length) {
				validLevel = parents.length - 1;
			}

			const parentItem = parents[validLevel];
			const afterItem = lastSiblingAtLevel[validLevel] || null;

			// Determine content type
			let type = "text";
			let content = trimmed;
			let headingLevel = 0;
			let checkState = null;

			if (line.match(/^\s*#{1,6}\s+/)) {
				const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
				type = "heading";
				headingLevel = headerMatch[1].length;
				content = headerMatch[2];
			}
			else if (trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/)) {
				type = "task";
				const match = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
				checkState = match[1].toLowerCase() === 'x';
				content = match[2];
			}
			else if (trimmed.match(/^[-*]\s+(.*)/)) {
				type = "ulist";
				const match = trimmed.match(/^[-*]\s+(.*)/);
				content = match[1];
			}
			else if (trimmed.match(/^\d+\.\s+(.*)/)) {
				type = "olist";
				const match = trimmed.match(/^\d+\.\s+(.*)/);
				content = match[1];
			}
			else if (trimmed.startsWith('>')) {
				type = "quote";
				content = trimmed.replace(/^>\s*/, '');
			}

			// Create the item
			const item = await record.createLineItem(parentItem, afterItem, type);
			if (item) {
				if (type === "heading") item.setHeadingSize(headingLevel);
				const segments = this.parseSegments(content);
				item.setSegments(segments);
				if (type === "task" && checkState) item.setMetaProperty("checked", 1);

				// Update State
				lastSiblingAtLevel[validLevel] = item;
				parents[validLevel + 1] = item;

				for (let k = validLevel + 1; k < lastSiblingAtLevel.length; k++) {
					lastSiblingAtLevel[k] = null;
				}
				parents.length = validLevel + 2;
			}
		}
	}

	parseSegments(text) {
		const segments = [];
		let currentIndex = 0;
		const tokenRegex = /(`+)(.*?)\1|(\*\*|__)(.*?)\3|(\*|_)(.*?)\5|(~~)(.*?)\7|\[([^\]]+)\]\(([^)]+)\)/g;

		let match;
		while ((match = tokenRegex.exec(text)) !== null) {
			if (match.index > currentIndex) {
				segments.push({ type: "text", text: text.slice(currentIndex, match.index) });
			}
			if (match[1]) segments.push({ type: "code", text: match[2] });
			else if (match[3]) segments.push({ type: "bold", text: match[4] });
			else if (match[5]) segments.push({ type: "italic", text: match[6] });
			else if (match[7]) segments.push({ type: "text", text: match[0] });
			else if (match[10]) segments.push({ type: "text", text: match[9] });

			currentIndex = tokenRegex.lastIndex;
		}

		if (currentIndex < text.length) {
			segments.push({ type: "text", text: text.slice(currentIndex) });
		}
		if (segments.length === 0) {
			segments.push({ type: "text", text: text });
		}
		return segments;
	}
}

import { Plugin, TAbstractFile, TFile } from "obsidian";
import { isInstanceOf, isNotNull, isNotUndefined } from "typed-assert";

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

interface LinkMetadata {
	/**
	 * foo#^bar
	 */
	link: string;

	/**
	 * ![[foo#^bar]]
	 */
	original: string;
	position: {
		start: {
			offset: number;
		};
		end: {
			offset: number;
		};
	};
}

declare module "obsidian" {
	interface MetadataCache {
		getBacklinksForFile: (file: TAbstractFile) => {
			data: { [fileName: string]: Array<LinkMetadata> };
		};
	}
}

const HEADING_PATTERN = /^#+\s.+$/gm;
const BLOCK_ID_PATTERN = /\s+(\^[a-zA-Z0-9-]+)$/gm;
const NOT_LETTER_OR_NUMBER_PATTERN = /[^\p{Letter}\p{Number}]/gu;

function getBlockIds(text: string) {
	return [...text.matchAll(BLOCK_ID_PATTERN)].map((match) => match[1]);
}

function getHeadings(text: string) {
	return [...text.matchAll(HEADING_PATTERN)].map((match) => match[0]);
}

function normalizeHeading(text: string) {
	return text.replaceAll(NOT_LETTER_OR_NUMBER_PATTERN, "");
}

function getNormalizedHeadingInLink(link: string) {
	const headingPart = link.split("#")[1];
	if (headingPart) {
		return normalizeHeading(headingPart);
	}
	return null;
}

function replaceFilePathInLink(link: string, newPath: string) {
	return link.replace(FILE_PATH_IN_LINK_PATTERN, `$1${newPath}$2`);
}

const FILE_PATH_IN_LINK_PATTERN = /(\[\[).*(#)/;
export default class MyPlugin extends Plugin {
	settings!: MyPluginSettings;
	sourceFile: TFile | null | undefined;

	async onload() {
		await this.loadSettings();

		const body = document.querySelector("body");
		isNotNull(body);

		this.registerDomEvent(body, "cut", () => {
			this.sourceFile = this.app.workspace.getActiveFile();
		});

		this.app.workspace.on("editor-paste", this.handleEditorPaste);
	}

	private handleEditorPaste = async (event: ClipboardEvent) => {
		if (!this.sourceFile) {
			return;
		}

		const text = event?.clipboardData?.getData("text");

		if (!text) {
			return;
		}

		const blockIds = getBlockIds(text);
		const headings = getHeadings(text);

		if (blockIds.length === 0 && headings.length === 0) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(this.sourceFile.path);
		isNotNull(file);

		const backlinks = this.app.metadataCache.getBacklinksForFile(file).data;

		Object.entries(backlinks)
			.map(([filePath, links]) => ({
				filePath,
				links: links.filter(
					({ link: linkText }) =>
						blockIds.some((id) => linkText.includes(id)) ||
						headings.some(
							(heading) =>
								getNormalizedHeadingInLink(linkText) ===
								normalizeHeading(heading)
						)
				),
			}))
			.filter(({ links }) => links.length > 0)
			.map(({ filePath, links }) =>
				this.updateFile(
					filePath,
					this.createLinkUpdateCallback(filePath, links)
				)
			);
	};

	private async updateFile(path: string, callback: (old: string) => string) {
		const fileToUpdate = this.app.vault.getAbstractFileByPath(path);
		isInstanceOf(fileToUpdate, TFile);

		const fileToUpdateText = await this.app.vault.read(fileToUpdate);

		// todo: this is just a hack
		setTimeout(() => {
			this.app.vault.modify(fileToUpdate, callback(fileToUpdateText));
		}, 10);
	}

	private createLinkUpdateCallback(filePath: string, links: LinkMetadata[]) {
		return (text: string) => {
			return links
				.slice()
				.reverse() // do not break offsets when replacing stuff
				.reduce(
					(
						updatedText: string,
						{ position, original }: LinkMetadata
					) => {
						const start = position.start.offset;
						const end = position.end.offset;

						const updated = replaceFilePathInLink(
							original,
							this.app.metadataCache.fileToLinktext(
								this.getActiveFile(),
								filePath
							)
						);

						return `${updatedText.substring(
							0,
							start
						)}${updated}${updatedText.substring(end)}`;
					},
					text
				);
		};
	}

	private getActiveFile() {
		const activeFile = this.app.workspace.getActiveFile();
		isNotNull(activeFile, "Expected to be in some file while pasting");
		return activeFile;
	}

	private getActiveFileName() {
		const activeFileName = this.app.workspace.getActiveFile()?.basename;
		isNotUndefined(
			activeFileName,
			"Expected to be in some file while pasting"
		);
		return activeFileName;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

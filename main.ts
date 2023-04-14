import { Editor, Plugin, TAbstractFile, TFile } from "obsidian";
import {
	isInstanceOf,
	isNotNull,
	isNotUndefined,
	isNotVoid,
} from "typed-assert";

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

	private handleEditorPaste = async (
		event: ClipboardEvent,
		editor: Editor,
		info: unknown
	) => {
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
			.map(async ({ filePath, links }) => {
				await this.updateFile(
					filePath,
					this.createLinkUpdateCallback(links)
				);
			});
	};

	private async updateFile(path: string, callback: (old: string) => string) {
		const fileToUpdate = this.app.vault.getAbstractFileByPath(path);
		isInstanceOf(fileToUpdate, TFile);

		const fileToUpdateText = await this.app.vault.read(fileToUpdate);
		await this.app.vault.modify(fileToUpdate, callback(fileToUpdateText));
	}

	private createLinkUpdateCallback(links: LinkMetadata[]) {
		return (text: string) => {
			return links.reduce(
				(updatedText: string, linkData: LinkMetadata) => {
					const start = linkData.position.start.offset;
					const end = linkData.position.end.offset;

					isNotVoid(this.sourceFile);
					const updated = linkData.original.replace(
						this.sourceFile.basename,
						this.getActiveFileName()
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

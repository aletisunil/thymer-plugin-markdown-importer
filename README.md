# Thymer Markdown Importer Plugin

Smartly imports markdown from your clipboard into Thymer notes, preserving formatting, lists, nesting, and spacing.

## ✨ Features

- **Preserves Structure**: Maintains indentation and nested lists (e.g., bullets under bullets).
- **Smart Formatting**: Converts headers, bold, italic, inline code, and links.
- **Lists Support**: Handles both unordered (`-`, `*`) and ordered (`1.`) lists.
- **Tasks**: Imports tasks (`- [ ]`, `- [x]`) as interactive checkbox items.
- **Spacing**: Preserves blank lines for readable notes.
- **Clean Import**: Automatically splits multiple H1 headers into separate notes.

## 📦 Installation

1. Open **Thymer** in your browser.
2. Press `Cmd+P` / `Ctrl+P` to open the Command Palette.
3. Select **"Plugins"**.
4. Click **"Create Plugin"** to create a new Global Plugin.
5. In the Edit Code dialog:
    - **Custom Code tab**: Paste the contents of `plugin.js`.
    - **Configuration tab**: Paste the contents of `plugin.json`.
6. Click **Save**.

## 🚀 How to Use

1. **Copy** any markdown text to your clipboard.
2. In Thymer, open the Command Palette (`Cmd+P` / `Ctrl+P`).
3. Run the command **"Paste Markdown as Notes"**.

- If you have a note open, the content will be pasted at the bottom.
- If no note is open, new notes will be created automatically.

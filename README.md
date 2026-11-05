# MarkEdit-preview

Markdown view modes for [MarkEdit](https://github.com/MarkEdit-app/MarkEdit) that leverage [markedit-api](https://github.com/MarkEdit-app/MarkEdit-api).

## Installation

Install this extension from the [MarkEdit Extension Registry](https://markedit-app.github.io/extensions/#markedit-preview).

## Building

Run `yarn install && yarn build` to build and deploy the script.

To build the lite version, run `yarn build:lite` instead.

## Development

- `yarn test` — run tests
- `yarn lint` — run linting (also runs automatically before build)
- `yarn typecheck` — run TypeScript checks (also runs automatically before the full build)

## How to Use

Choose a mode from `Extensions` > `View Mode`, or use the keyboard shortcut <kbd>Shift–Command–V</kbd> to cycle through modes.

**Typora Style** is an additional editor mode with a centered writing column, spacious typography, aligned wrapped list and quote paragraphs, subtle code blocks, and light/dark palettes that follow the editor's appearance. It reuses Mixed mode's syntax-reveal editing behavior and renders images, tables, math, and Mermaid inline (math and Mermaid require the full build). It does not change the original modes or their default keyboard rotation. To include it in the rotation, add `"typora"` to `changeMode.modes`.

In Typora Style, code blocks show a copy button in the top-right corner, and tables show one on hover; tables are copied as Markdown and HTML so they paste as tables into rich text apps. The button briefly turns into a check mark after copying. Code blocks in the preview pane show the same feedback.

<img src="./screenshot.png" width="520" alt="Using MarkEdit-preview">

To display local images, please ensure you're using MarkEdit 1.24.0 or later and follow [the guide](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization#grant-folder-access) to grant file access.

This extension also exposes global functions, `MarkEditGetHtml(styled: boolean) => Promise<string>` and `MarkEditRenderHtml(markdown: string, styled: boolean) => Promise<string>`, allowing other extensions or scripts to easily generate the rendered HTML — either from the current document or from arbitrary markdown input.

## Styling

This extension applies the [github-markdown](https://github.com/sindresorhus/github-markdown-css) styling. You can customize the appearance by following the [customization](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization) guidelines.

The preview pane can be styled using the `markdown-body` CSS class.

For matching Typora-inspired styling in side-by-side preview, overlay preview, Quick Look, and styled HTML exports, set `"themeName": "typora"`. This preview theme is independent of the editor mode. The design is original, inspired by Typora's clean writing layout rather than a copy of its theme files.

For a Typora editor/preview rotation:

```json
{
  "extension.markeditPreview": {
    "themeName": "typora",
    "changeMode": {
      "modes": ["typora", "preview"]
    }
  }
}
```

## Settings

In [settings.json](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization#advanced-settings), you can define a settings node named `extension.markeditPreview` to configure this extension, default settings are:

```json
{
  "extension.markeditPreview": {
    "syncScroll": true,
    "hidePreviewButtons": true,
    "syntaxAutoDetect": false,
    "imageHoverPreview": false,
    "pastedImageFolder": "assets",
    "inlineRendering": ["math", "mermaid"],
    "themeName": "github",
    "styledHtmlColorScheme": "auto",
    "mathDelimiters": [],
    "changeMode": {
      "modes": ["edit", "side-by-side", "preview", "syntax-hidden"],
      "hotKey": {
        "key": "V",
        "modifiers": ["Command"]
      }
    },
    "markdownIt": {
      "preset": "default",
      "options": {}
    }
  }
}
```

- `syncScroll`: Whether to enable scroll synchronization.
- `hidePreviewButtons`: Whether to hide the built-in preview buttons in side-by-side mode (not applicable for lite build).
- `syntaxAutoDetect`: Whether to enable automatic language detection for syntax highlighting in code blocks (not applicable for lite build).
- `imageHoverPreview`: Whether to enable image preview on hover.
- `pastedImageFolder`: Folder, relative to the document, where pasted images are saved before a Markdown link is inserted. Defaults to `"assets"`; `${filename}` is replaced with the document name without its extension (for example `"${filename}.assets"`). Use `false` to disable it and fall back to other paste handlers. In untitled documents, images are passed to the default paste handlers until the document is saved. Rich pastes that include HTML are left unchanged.
- `inlineImages` (deprecated): Whether Mixed mode renders images inline, defaults to `false`. Use `inlineRendering` instead; an explicit `inlineRendering` array takes precedence.
- `inlineRendering`: Types rendered inline in Mixed mode: `"table"`, `"math"`, `"mermaid"`, `"image"`, and `"html"`. Defaults to `["math", "mermaid"]`; use `[]` to disable all rendering. Math and Mermaid rendering require the full build.
- `themeName`: Set the preview color theme, available themes can be found in the [`styles/themes`](styles/themes) folder. Use `"none"` to disable preview styling and render the raw HTML.
- `styledHtmlColorScheme`: Determine the color scheme of saving styled html files, valid values are `light`, `dark`, and `auto`.
- `mathDelimiters`: Customize math delimiters for KaTeX rendering (not applicable for lite build), each delimiter object has `left`, `right`, and `display` properties, defaults to `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`.
- `changeMode.modes`: Order modes by ID: `edit` (Markdown Source), `side-by-side` (Side-by-Side), `preview` (Overlay), `syntax-hidden` (Mixed), and `typora` (Typora Style). If no editor mode is included, `edit` is added automatically.
- `changeMode.hotKey`: Assign keyboard shortcuts for mode switching. See the specification [here](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization#generalmainwindowhotkey).
- `markdownIt.preset`: Override the default [markdown-it](https://markdown-it.github.io/markdown-it/#MarkdownIt.new) preset.
- `markdownIt.options`: Customize [markdown-it](https://markdown-it.github.io/markdown-it/#MarkdownIt.new) options.

> [!TIP]
>
> In MarkEdit 1.33.0 or later, this extension also provides preview support in [Quick Look](https://github.com/MarkEdit-app/MarkEdit/wiki/Manual#quick-look-extension).
>
> To add menu items to the toolbar, see MarkEdit [Customization](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization#editorcustomtoolbaritems) wiki.

## Community Extensions

- [Bidirectional Preview Sync](https://github.com/Nigelw/MarkEdit-bidirectional-preview-sync) (by [@Nigelw](https://github.com/Nigelw/)): Keeps MarkEdit’s editor and preview modes synchronized as you switch between them and scroll, replacing MarkEdit-preview's one-way editor→preview sync.
- [Direct Preview](https://github.com/Squarelight-ai/markedit-direct-preview) (by [@Squarelight-ai](https://github.com/Squarelight-ai)): A setup helper that provides a one-click setup for a two-mode Edit/Preview toggle by configuring the toolbar item and `changeMode.modes` for you.

## Contribution

Pull requests are welcome, but please discuss the proposal before making changes. This helps avoid misunderstandings and saves effort on both sides.

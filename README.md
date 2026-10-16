# Disklands

Disklands is a Windows desktop app for exploring local disk usage. It shows file and folder sizes as a biome map, an isometric view, and sortable lists.

Current version: 1.3.0. Target: Windows x64.

## Run the app

Open `release/Disklands-1.3.0-Windows.exe` or double-click `Open Disklands.cmd`. The portable EXE does not require installation or Node.js.

1. Select **Choose folder**, or click a drive in the sidebar to scan the whole drive.
2. After the scan, click a folder on the map to explore it. Use the breadcrumb or **Parent folder** to go back.
3. Open **Largest files** to find large files anywhere under the scanned directory.
4. Select a file to see its size and path. Use **Show in Explorer**, **Copy path**, or **Export CSV** as needed.

**Stop** cancels an active scan. An earlier completed result remains available.

## Language

English is the default. Use the language selector in the top right to switch between **English** and **Bahasa Indonesia**. The choice is saved for the next launch. The app name remains **Disklands** in both languages. The folder picker, export dialog, and CSV headings follow the selected language.

## Features

- Biome, Isometric, and List views of the scanned directory.
- Up to 500 largest files, with search and file type and minimum size filters.
- Sorting by size, name, or modification time.
- Storage breakdown by file extension.
- Details for size, path, modification time, and folder contents.
- CSV export of the summary, categories, and largest files.
- History of up to 30 completed scans.

Disklands reads file metadata locally. It does not upload, delete, or move files. File management is done in Windows Explorer.

## Map and size calculation

Region area represents logical byte size. Trees, rocks, water, and buildings are decorative; their number does not encode file count or capacity. A folder's biome is based on its path and stays consistent when the list is sorted or filtered. A file's biome follows its category.

The map shows up to 11 main regions, each using at least 1.8% of the displayed total. The remaining size is grouped as **Other**. Click that region to open the list and search. **Folders only** limits the map to subfolders.

Sizes use powers of 1,024: KB, MB, GB, and so on. Hidden files are included. The folder count excludes the selected root.

| View | Limit |
| --- | --- |
| Folder index | All subfolders and the 30 largest files directly inside each folder. |
| Directory contents | Up to 150 items after search and sorting. |
| Map list | Up to 30 items from the current folder index. |
| Largest files | Up to 500 files from the complete scan. |

Files omitted from the index still count toward total size and file count. Search in **Directory contents** uses the current folder index. Search and filters in **Largest files** use the top 500 files. CSV does not export every file.

Empty folders remain indexed, but they have no map region because their size is 0 bytes. Open them through the directory list.

Logical size can differ from **Size on disk** in Windows Explorer because of compression, sparse files, cloud files, or hard links. Hard links may be counted more than once. Drive capacity covers the entire drive; directory size covers only the selected folder.

Symbolic links and junctions are skipped. Unreadable locations are reported, and totals include only readable items. Files changing during a scan may also affect the result.

## Saved data

The scanner reads names, paths, sizes, and modification times without opening file contents for analysis.

Scan history and the selected language are stored in `history.json` in the Electron user data directory. The folder index stays in memory. On first launch, Disklands reads existing Ruang history if available; future changes are saved under the Disklands app data directory. Use **Scan again** to explore a previous folder.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Choose a folder when no scan is running. |
| `Ctrl+F` | Focus search on the current page, if available. |
| `Esc` | Close details or the guide. |

## Development

Use Node.js 22.12 or newer and npm. Installing dependencies requires an internet connection.

```powershell
npm ci
npm run dev
```

The development command starts Vite at `http://127.0.0.1:5173` and opens Electron. Port 5173 must be available. The browser page is a visual preview; local file access is provided by Electron.

To scan a folder when the development app opens:

```powershell
npm run dev -- --scan="D:\Folder Example"
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and Electron. |
| `npm test` | Test the scanner, size calculations, index limits, and biomes. |
| `npm run build` | Build the production interface in `dist/`. |
| `npm start` | Open Electron with the production build. |
| `npm run package` | Build the interface and a portable Windows x64 EXE. |

To build the portable package:

```powershell
npm run package
```

The result is written to `release/v1.3.0/Disklands-1.3.0-Windows.exe` and copied to `release/Disklands-1.3.0-Windows.exe`. The version comes from `package.json`.

## Code layout

```text
electron/main.cjs       Window, IPC, drives, history, language, and CSV export
electron/preload.cjs    Desktop API exposed to the renderer
electron/scanner.cjs    Metadata scanning in a worker thread
src/main.js            Interface and navigation
src/i18n.js            English UI translations
src/biomes.js          Biome selection and scenery
src/biome-theme.css    Biome theme and isometric view
src/style.css          Base interface styling
scripts/package.cjs    Portable package build
tests/                 Scanner and biome tests
```

The interface uses JavaScript, Vite, and a locally bundled Inter font. Electron provides desktop access through a preload API with context isolation.

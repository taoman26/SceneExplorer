# SceneExplorer

> **Note**: This is a fork of [ambiesoft/SceneExplorer](https://github.com/ambiesoft/SceneExplorer) with the following custom extensions:
> - Selectable thumbnail count per video (3, 5, or 10)
> - Timestamp overlay on thumbnails
> - DVD ISO file support (thumbnail generation via p7zip)

SceneExplore explores video files through thumbnails.

## Feature
* You can explorers video files by viewing its thumbnails.
* Supported video format is dependent on FFmpeg.

## Download
Download the official binary from <https://github.com/ambiesoft/SceneExplorer/releases>.

## License
This software is freeware. See LICENSE.

## Environment
Runs on Windows 7 or above. This repository is customized for Linux and Haiku, and has been verified on Ubuntu 22.04 and Haiku OS. It may also run on macOS.

## Install
Installation is not required, extract an archive file.


## FFmpeg and FFprobe
SceneExplorer needs FFmpeg and FFprove to create thumbnails. In windows distribution, these files are included in the archive file, you do not need to obtain them by yourself. 

## p7zip (for DVD ISO support)
To generate thumbnails from DVD ISO files, SceneExplorer requires **7z** (provided by p7zip).
- **Linux**: install with `sudo apt install p7zip-full` (Debian/Ubuntu) or equivalent.
- **Haiku**: install **p7zip** from HaikuDepot.
- **Windows**: install [7-Zip](https://www.7-zip.org/) and ensure `7z.exe` is in your PATH.

Without p7zip, ISO files will be scanned but thumbnails will not be generated.


## How to use
### Add a folder containing videos.
Choose **[Folder]->[Add Folder]**.


### Creating thumbnails
* From the folder pane, Right-click a folder and select **[Rescan to create thumbnails]**.
* Or from the menu, select **[Task]->[start scan to create thumbnails...]** to start creating thumbnails.

### View thumbnails
From the folder pane, choose a folder to show its thumbnails. Clicking **[All]** shows all thumbnails and **[Missing]** shows thumbnails which original video files are missing.

### Adding Tags
Tags provide a useful way to group related videos together and tell what a video is about. Tags also make it easier to find your content. Tags are similar to but more specific than, directories. The use of tags is completely optional.

You can create a new tag from **[Tag]->[Add New Tag...]** and it will be shown on Tag pane. If you select Tag, tagged videoes will be shown.

## Files and Directories
There are 3 types of path SceneExplorer uses.
### Database directory
The image files of thumbnails are stored under DatabaseDirectory/thumbs/ and its information is stored in database DatabaseDirectory/db.sqlite3. DatabaseDirectory can be configured by Preference Option or by command-line option "-d". Default location is *C:\Users\<Username>\AppData\Local\Ambiesoft\SceneExplorer*.

### Preference file
This file stores app configurations modified by a user through Option Dialogs. You can change the location by using FolderConfig.exe". Default location is *C:\Users\<Username>\AppData\Roaming\Ambiesoft\SceneExplorer\SceneExplorer.ini*.

### Document file
This file holds Folders which user assigns. If you supply filename in command-line, the file will open. Default location is *C:\Users\<Username>\Documents\SceneExplorer\default.scexd*.


## Portable
If you want to make SceneExplorer portable, follow these instructions.
1. Launch **FolderConfig.exe** and select "Under this folder".
2. Launch SceneExplorer.exe, open **option**, Check **Use custom database directory**, and enter **Database directory** as *${SCENEEXPLORER_ROOT}/db*.
3. Or use command-line opton "-d" to specifiy the database directory.
4. Create a document file in this directory.
5. Create a *.bat file in the directory and write down the script as follow. This example launch **MyApp.scexd**.
```
start "" %~dp0SceneExplorer.exe %~dp0MyApp.scexd
```
6. Or create a shortcut file.

See *Help -> About Documents* to confirm which files are used.

## Uninstall
1. Select **[Help] -> [About Document]** and find which directory is used. 
2. Remove those files and directories. 


## WebUI (use the library from any machine on your LAN)

> **Platform**: the WebUI has been developed and tested **on Linux only** (Ubuntu, including WSL2). Windows, macOS and Haiku are untested; see "Running on other systems" below for what has to be changed there.

`webui/` contains a browser interface (React) served by a small Node.js server. It reads the same database, thumbnails and
document file as the Qt application, so **SceneExplorer does not have to be running** to browse, search, play and tag.
Scanning folders and creating thumbnails are still done in the Qt application.

* Browse by folder / tag / untagged / missing, search by file name, sort, page through thumbnails
* Play videos in the browser (HTTP range streaming), jump to a thumbnail's position, download
* Edit tags (shared with the Qt application through the document file); the play count is updated too
* User accounts: `admin` (everything + user management), `user` (tags, play counts), `viewer` (read only)
* Phone, tablet and desktop layouts

### Start (Linux)
Requires **Node.js 22.13 or newer**.
```
cd webui
./start.sh
```
`start.sh` installs the dependencies and builds the client on first run, then prints the URLs to open, e.g.
`http://192.168.1.20:8686`. **The first visitor creates the administrator account, so open the page right away.**
Further users are added by an administrator from the user menu -> *ユーザー管理*.

Settings (environment variables, all optional):

| Variable | Default | Meaning |
|---|---|---|
| `SE_HOST` | `0.0.0.0` | Listen address. Use `127.0.0.1` to allow this machine only |
| `SE_PORT` | `8686` | Port |
| `SE_DB_DIR` | `$XDG_DATA_HOME/Ambiesoft/SceneExplorer` (`~/.local/share/...`) | Database directory (`db.sqlite3`, `thumbs/`); same as the Qt application's *Database directory* |
| `SE_DOC_FILE` | `<Documents folder>/SceneExplorer/default.scexd` | Document file to show. The Documents folder is looked up the way the Qt application does it, so a localized name such as `~/ドキュメント` works: `$XDG_DOCUMENTS_DIR`, else `XDG_DOCUMENTS_DIR` in `~/.config/user-dirs.dirs`, else `~/Documents` |
| `SE_DATA_DIR` | `webui/data` | Where the WebUI keeps its user accounts (`webui.sqlite3`) |

### Running on other systems (untested)
Everything below is untested; the code itself is plain Node.js and browser code, but these Linux-specific parts need attention:

* **`start.sh` is a bash script.** On Windows, run the steps by hand (PowerShell):
  ```
  cd webui\server;  npm install --omit=dev
  cd ..\client;      npm install; npm run build
  cd ..\server
  $env:SE_DB_DIR   = "$env:LOCALAPPDATA\Ambiesoft\SceneExplorer"
  $env:SE_DOC_FILE = "$env:USERPROFILE\Documents\SceneExplorer\default.scexd"
  node src/index.js
  ```
  (`cmd.exe`: use `set SE_DB_DIR=...`.) Node.js 22.13 or newer is needed on every platform.
* **Default paths are the Linux ones** (`$XDG_DATA_HOME/Ambiesoft/SceneExplorer` and the XDG Documents folder, defined in
  `webui/server/src/config.js`). On other systems set `SE_DB_DIR` / `SE_DOC_FILE`; the paths the Qt application really uses are shown in
  its *Help -> About Documents* dialog (Windows defaults: see *Files and Directories* above).
* **Video paths are read from the database as they were recorded by the Qt application** (absolute paths). The server must run on a
  machine where those exact paths exist. A database created on Windows (`C:/Videos/...`) will list its videos on a Linux server, but
  they cannot be played unless the same paths exist there. Windows-style paths (drive letters, backslashes) have not been tried.
* **Development tools** (`webui/dev/*`, `webui/design/make_design.py`): the shell scripts need bash, and the Python scripts need
  Pillow, ffmpeg and a Japanese font whose path is hard-coded (`FONT` in the scripts, currently Noto Sans CJK under
  `/usr/share/fonts`). `run_dummy_server.sh` refuses to start on real-library paths by matching Linux default paths; adapt that
  check for other systems.
* Thumbnails are found on disk in both of the Qt application's naming forms (default size `<id>-<n>.jpg`, custom size
  `<id>-<W>x<H>-<n>.jpg`), so the thumbnail size setting does not matter.

### Notes
* **HTTP only, for trusted LANs.** Do not expose the port to the internet. If you need HTTPS or remote access, put a reverse
  proxy (with TLS) or a VPN in front of it. All API access, including thumbnails and video streams, requires signing in;
  failed sign-ins are rate limited.
* The video files must be reachable from the machine running the server (mounted disks). Videos on unmounted disks are listed,
  but cannot be played.
* Formats that the browser cannot decode (depends on the browser) can only be downloaded; there is no transcoding.
* If the Qt application is running while you edit tags, it may need to reload the document to show the changes.
* **WSL2**: by default only the Windows host can reach a server inside WSL2. To use it from other machines, enable
  `networkingMode=mirrored` in `%UserProfile%\.wslconfig` (then `wsl --shutdown`), or forward the port with
  `netsh interface portproxy` and allow it in Windows Firewall. Windows Firewall may also ask for permission on native Windows.

### Development
```
cd webui/server && npm test          # API tests (generated dummy libraries only)
cd webui/client && npm run dev       # Vite dev server, proxies /api to localhost:8686
python3 webui/dev/make_dummy_library.py /tmp/dummy                  # fake library with 120 videos
webui/dev/run_dummy_server.sh /tmp/dummy /tmp/dummy-webui-data      # run the WebUI on the fake library
```
Screen designs (`webui/design/*.png`, made by `webui/design/make_design.py`), `webui/design.md` and `webui/schema.md` describe the
UI and the API. Please use the dummy library, not your real library, for screenshots and bug reports.

## Build
### Windows (by QtCreator)
Open 'src\SceneExplorer.pro' and build.

### Windows (incomplete)
The source in this repository has not been verified on Windows. If you need reliable Windows behavior, follow the official repository instructions.

Get the source and build tools by running the following command.
```
git clone https://github.com/ambiesoft/distSolution.git
git clone https://github.com/ambiesoft/profile.git
git clone https://github.com/ambiesoft/lsMisc.git
git clone https://github.com/ambiesoft/SceneExplorer.git
```

Copy *prepare.bat.sample* (in the directory *SceneExplorer*) and rename it to *prepare.bat* and edit it to set correct Environment values like as follows.
```
set PYTHONEXE=C:\local\python3.5\python.exe
set QTROOT=C:\local\Qt

set SOURCEDIR=src
set PRONAME=SceneExplorer

set FFMPEGSOURCEDIR=C:\LegacyPrograms\ffmpeg
set FFCEXE=C:\LegacyPrograms\FFC\FFC.exe
set DISTDIR=C:\Linkout\SceneExplorer
```

Run *build.bat*. This will build SceneExplorer into *C:\Linkout\SceneExplorer*.

### Linux
Get the source and build tools by running the following command.
```
git clone https://github.com/taoman26/lsMisc.git
git clone https://github.com/taoman26/SceneExplorer.git
```

Build SceneExplorer with following commands.
```
$ cd SceneExplorer
$ sh prepareGitrev.sh
$ mkdir build
$ cd build
$ qmake ../src/SceneExplorer.pro
$ make
```

> **Note**: `prepareGitrev.sh` generates `src/gitrev.h` which embeds the git commit hash
> shown in the About dialog. Run it before the first build and whenever you update the source.

Run
```
./SceneExplorer
```

### Haiku
Get the source and build tools by running the following command.
```
git clone https://github.com/taoman26/lsMisc.git
git clone https://github.com/taoman26/SceneExplorer.git
```

Build SceneExplorer with following commands.
```
$ cd SceneExplorer
$ sh prepareGitrev.sh
$ mkdir build
$ cd build
$ qmake ../src/SceneExplorer.pro
$ make
```

> **Note**: `prepareGitrev.sh` generates `src/gitrev.h` which embeds the git commit hash
> shown in the About dialog. Run it before the first build and whenever you update the source.

To add SceneExplorer to the Deskbar Applications menu:
```
mkdir -p ~/config/settings/deskbar/menu/Applications
ln -s $(pwd)/SceneExplorer ~/config/settings/deskbar/menu/Applications/SceneExplorer
```

Run
```
./SceneExplorer
```




## Support
For Windows users, post *Issue* on <https://github.com/ambiesoft/SceneExplorer/issues>.

For Linux and Haiku users, post *Issue* on <https://github.com/taoman26/SceneExplorer/issues>.

## Donate
Support Ambiesoft by making a donation. See <https://ambiesoft.github.io/webjumper/?target=donate>.

## Contact
- Author: Ambiesoft trueff
- E-mail: <ambiesoft.trueff@gmail.com>
- Webpage: <https://ambiesoft.github.io/webjumper/?target=home>
- Forum: <https://ambiesoft.github.io/webjumper/?target=bbs>
- Development: <https://github.com/ambiesoft/SceneExplorer>


## Legal
### FFmpeg
This software uses code of [FFmpeg](http://ffmpeg.org) licensed under the 
[GPLv3](https://www.gnu.org/licenses/gpl-3.0.html) and its 
source can be downloaded [here](https://github.com/ambiesoft/FFmpeg).

### Qt
This software uses Qt.
Source code: <https://github.com/ambiesoft/qt5/tree/5.10>

### Icons
* Icons made by <a href="http://www.freepik.com" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
* Icons made by <a href="https://www.flaticon.com/authors/kiranshastry" title="Kiranshastry">Kiranshastry</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
* Icons made by <a href="https://www.flaticon.com/authors/gregor-cresnar" title="Gregor Cresnar">Gregor Cresnar</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
* Icons made by <a href="https://www.flaticon.com/authors/dave-gandy" title="Dave Gandy">Dave Gandy</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
* Icons made by <a href="http://www.freepik.com" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
* Icons made by <a href="https://www.flaticon.com/authors/smashicons" title="Smashicons">Smashicons</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>
* Icons made by <a href="https://www.flaticon.com/authors/pixelmeetup" title="Pixelmeetup">Pixelmeetup</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a>

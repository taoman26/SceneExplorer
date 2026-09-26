# SceneExplorer

> **注意**: このリポジトリは [ambiesoft/SceneExplorer](https://github.com/ambiesoft/SceneExplorer) のforkで、以下の独自拡張を加えています。
> - 動画ごとのサムネイル枚数を選択可能（3枚・5枚・10枚）
> - サムネイルへのタイムスタンプ表示
> - DVD ISOファイル対応（p7zipを使ったサムネイル生成）

SceneExploreは動画ファイルのサムネイルを表示するアプリケーションです。

## 特徴
* サムネイルから動画を探せます。
* サポートされる動画フォーマットはFFmpegに依存します。


## ダウンロード
公式版のダウンロードはこちらか行えます。<https://github.com/ambiesoft/SceneExplorer/releases>.


## ライセンス
このソフトウェアはフリーウェアです。LICENSEを御覧ください。


## 動作環境
Windows7以上で動作します。このリポジトリはLinuxやHaiku向けにカスタマイズされており、Ubuntu 22.04 と Haiku OS で動作を確認しました。macOSでも動作するかもしれません。


## インストール
インストールは必要ありません。アーカイブを解凍してください。


## FFmpeg と FFprobe
SceneExplorerはサムネイルを作成するためにFFmpegとFFproveが必要になります。Windowsの配布ファイルにはこれらが含まれています。これらはLGPL互換モードでビルドされたものなのでいくつかの機能が存在しない可能性がありサムネイルを作成できない可能性があります。オプション設定で実行ファイル指定できるので変えたい場合は変えてください。

## p7zip（DVD ISOサポート用）
DVD ISOファイルのサムネイルを生成するには、**7z**（p7zipが提供）が必要です。
- **Linux**: `sudo apt install p7zip-full`（Debian/Ubuntu系）または同等のコマンド。
- **Haiku**: HaikuDepotから **p7zip** をインストール。
- **Windows**: [7-Zip](https://www.7-zip.org/) をインストールし、`7z.exe` がPATHに含まれるようにしてください。

p7zipがない場合、ISOファイルはスキャンされますがサムネイルは生成されません。


## 使い方
### フォルダを追加する
メニューから**[フォルダ]→[フォルダの追加]**を選択します。

### サムネイルを作成
* フォルダペインからフォルダを右クリックし、**「スキャンしてサムネイルを作成」**を選択して作成できます。
* メニューから**[タスク]→[スキャンしてサムネイルを作成する]**を選択して作成できます。

### サムネイルを表示
フォルダペインからフォルダを選択するとそのフォルダのサムネイルが表示されます。[すべて]を選択するとすべてのサムネイルが表示されます。[存在しない]を選択するとファイルがなくなったサムネイルが表示されます。

### タグ
ビデオにタグを追加することができます。タグによりビデオをフィルタリングすることができます。

新しいタグを追加するには、**[タグ]→[新しいタグを追加]**をクリックします。追加されたタグはタグペインに表示されます。タグを選択するとそのタグでフィルタリングされます。

## ファイルやディレクトリ
このアプリが使う3つのタイプのパスがあります。
### データベースディレクトリ
サムネイルの画像ファイルとその管理のデータベースを置くディレクトリです。設定やコマンドライン(-d)から変えられます。デフォルトの位置は*C:\Users<Username>\AppData\Local\Ambiesoft\SceneExplorer*です。

### 設定ファイル
アプリの設定を保存するファイルです。*FolderConfig.exe*ツールで変更できます。デフォルトの位置は*C:\Users<Username>\AppData\Roaming\Ambiesoft\SceneExplorer\SceneExplorer.ini*です。

### ドキュメントファイル
アプリで追加したフォルダが保存されます。コマンドラインのメイン引数で指定できます。デフォルトの位置は*C:\Users<Username>\Documents\SceneExplorer\default.scexd*です。


## ポータブル
ポータブルで使いたいときは以下の手順で行います。
1. **FolderConfig.exe**を起動して、**exeのあるフォルダ**を選択します。
2. **SceneExplorer.exe**を起動して、オプションを開き、**カスタムデータベースディレクトリを使う**をチェックし、**データベースディレクトリ**に *${SCENEEXPLORER_ROOT}/db* と入力します。
3. このフォルダ内にドキュメントファイルをつくります。
4. 以下の起動バッチファイルを拡張子batで作成し、このファイルから起動します。この例では**MyApp.scexd**を起動しています。
```
start "" %~dp0SceneExplorer.exe %~dp0MyApp.scexd
```

どのファイルが開かれているかを確認するには*ヘルプ ⇒ ドキュメントについて*を参照してください。

## アンインストール
1. **[ヘルプ] → [ドキュメントについて]**を選択します。使われているファイルやディレクトリを確認できます。
2. それらのファイルを削除します。

## WebUI(LAN内のどのマシンからでもブラウザで操作)

> **対応環境**: WebUI は **Linux(Ubuntu。WSL2 を含む)でのみ**開発・動作確認をしています。Windows、macOS、Haiku は未確認です。それらで動かす場合に変更が必要な点は、下の「他の環境で動かす場合」を参照してください。

`webui/` に、Node.js の小さなサーバーと React 製のブラウザ UI が入っています。Qt アプリと同じデータベース・サムネイル・
ドキュメントファイルを読むため、**SceneExplorer を起動していなくても**閲覧・検索・再生・タグ編集ができます。
フォルダのスキャンやサムネイル作成は、これまでどおり Qt アプリで行います。

* フォルダ / タグ / タグなし / 欠損ファイルで絞り込み、ファイル名検索、並び替え、ページ送り
* ブラウザ内で動画を再生(HTTP Range 対応)、サムネイルの位置へジャンプ、ダウンロード
* タグの編集(ドキュメントファイル経由で Qt アプリと共有)。再生回数も更新されます
* ユーザー認証: `admin`(全操作とユーザー管理)、`user`(タグ・再生回数)、`viewer`(閲覧のみ)
* スマホ・タブレット・PC のレイアウトに対応

### 起動(Linux)
**Node.js 22.13 以上**が必要です。
```
cd webui
./start.sh
```
初回は依存パッケージのインストールとクライアントのビルドを行い、開くべき URL(例: `http://192.168.1.20:8686`)を表示します。
**最初にアクセスした人が管理者アカウントを作成するため、起動後すぐにアクセスしてください。**
ユーザーの追加は、管理者がユーザーメニューの「ユーザー管理」から行います。

設定(環境変数。すべて省略可):

| 変数 | 既定値 | 内容 |
|---|---|---|
| `SE_HOST` | `0.0.0.0` | 待ち受けアドレス。このマシンだけに限定するなら `127.0.0.1` |
| `SE_PORT` | `8686` | ポート |
| `SE_DB_DIR` | `~/.local/share/Ambiesoft/SceneExplorer` | データベースディレクトリ(`db.sqlite3` と `thumbs/`)。Qt アプリの「データベースディレクトリ」と同じもの |
| `SE_DOC_FILE` | `~/Documents/SceneExplorer/default.scexd` | 表示するドキュメントファイル |
| `SE_DATA_DIR` | `webui/data` | WebUI のユーザーアカウント(`webui.sqlite3`)の保存先 |

### 他の環境で動かす場合(未確認)
以下はすべて未確認です。コード自体は Node.js とブラウザ用の標準的なものですが、Linux に依存している次の部分に注意が必要です。

* **`start.sh` は bash スクリプトです。** Windows では、手順を手で実行してください(PowerShell)。
  ```
  cd webui\server;  npm install --omit=dev
  cd ..\client;      npm install; npm run build
  cd ..\server
  $env:SE_DB_DIR   = "$env:LOCALAPPDATA\Ambiesoft\SceneExplorer"
  $env:SE_DOC_FILE = "$env:USERPROFILE\Documents\SceneExplorer\default.scexd"
  node src/index.js
  ```
  (`cmd.exe` では `set SE_DB_DIR=...`)。Node.js 22.13 以上が、どの環境でも必要です。
* **既定のパスは Linux のものです**(`~/.local/share/Ambiesoft/SceneExplorer`、`~/Documents/SceneExplorer/default.scexd`。
  `webui/server/src/config.js` で定義)。他の環境では `SE_DB_DIR` と `SE_DOC_FILE` を指定してください。Qt アプリが実際に使っている
  パスは、*ヘルプ -> ドキュメントについて* で確認できます(Windows の既定値は上の「ファイルやディレクトリ」を参照)。
* **動画のパスは、Qt アプリが記録したままの絶対パスとしてデータベースから読みます。** そのパスが実在するマシンでサーバーを
  動かす必要があります。Windows で作ったデータベース(`C:/Videos/...`)を Linux のサーバーで開くと、動画は一覧に出ますが、同じ
  パスがなければ再生できません。Windows 形式のパス(ドライブ文字、バックスラッシュ)は試していません。
* **開発用ツール**(`webui/dev/*`、`webui/design/make_design.py`): シェルスクリプトは bash が必要で、Python スクリプトは Pillow、ffmpeg、
  パスが固定された日本語フォント(スクリプト内の `FONT`。現在は `/usr/share/fonts` の Noto Sans CJK)が必要です。
  `run_dummy_server.sh` は Linux の既定パスとの一致で実ライブラリを判定して起動を拒否するので、他の環境では判定を直してください。
* サムネイルは、Qt アプリの 2 種類のファイル名形式(既定サイズは `<id>-<n>.jpg`、任意のサイズは `<id>-<幅>x<高さ>-<n>.jpg`)
  のどちらでも、ディスク上から見つけます。サムネイルサイズの設定は問いません。

### 注意
* **HTTP のみで、信頼できる LAN 内での利用が前提です。** ポートをインターネットに公開しないでください。HTTPS や外出先からの
  利用が必要な場合は、TLS 対応のリバースプロキシや VPN を前段に置いてください。サムネイルや動画を含むすべての API は
  ログインが必要で、ログインの連続失敗は制限されます。
* 動画ファイルは、サーバーを動かすマシンから見える場所(マウント済みのディスク)にある必要があります。未マウントのディスクの
  動画は一覧に出ますが再生できません。
* ブラウザが再生できない形式(ブラウザによって異なります)はダウンロードのみです。トランスコードは行いません。
* Qt アプリの起動中にタグを編集した場合、Qt アプリ側で変更を見るにはドキュメントの再読み込みが必要かもしれません。
* **WSL2**: 既定では、WSL2 内のサーバーには Windows ホストからしかアクセスできません。他のマシンから使うには、
  `%UserProfile%\.wslconfig` で `networkingMode=mirrored` を有効にする(その後 `wsl --shutdown`)か、`netsh interface portproxy`
  でポートを転送して Windows ファイアウォールで許可してください。Windows 上で直接動かす場合も、ファイアウォールの許可を
  求められることがあります。

### 開発
```
cd webui/server && npm test          # API テスト(自動生成したダミーライブラリのみ使用)
cd webui/client && npm run dev       # Vite 開発サーバー(/api を localhost:8686 へ中継)
python3 webui/dev/make_dummy_library.py /tmp/dummy                  # 動画120本のダミーライブラリ
webui/dev/run_dummy_server.sh /tmp/dummy /tmp/dummy-webui-data      # ダミーライブラリで WebUI を起動
```
画面デザイン(`webui/design/*.png`、`webui/design/make_design.py` で生成)、`webui/design.md`、`webui/schema.md` に UI と API の
仕様があります。スクリーンショットや不具合報告には、実ライブラリではなくダミーライブラリを使ってください。

## ビルド
### Windows
本リポジトリのソースはWindowsで動作を確認していません。Windowsで確実に動作させたい場合は、公式サイトの手順に従ってください。
以下のコマンドでソースとビルドツールを取得します。
```
git clone https://github.com/ambiesoft/distSolution.git
git clone https://github.com/ambiesoft/profile.git
git clone https://github.com/ambiesoft/lsMisc.git
git clone https://github.com/ambiesoft/SceneExplorer.git
```

*prepare.bat.sample* をコピーしてからリネームして、*prepare.bat*に変えます。その後このファイルを編集して自分の環境に合わせます。例として以下のようになります。
```
set PYTHONEXE=C:\local\python3.5\python.exe
set QTROOT=C:\local\Qt

set SOURCEDIR=src
set PRONAME=SceneExplorer

set FFMPEGSOURCEDIR=C:\LegacyPrograms\ffmpeg
set FFCEXE=C:\LegacyPrograms\FFC\FFC.exe
set DISTDIR=C:\Linkout\SceneExplorer
```

build.batを実行します。*C:\Linkout\SceneExplorer* にビルドされます。

### Linux
以下のコマンドでソースとビルドツールを取得します。
```
git clone https://github.com/taoman26/lsMisc.git
git clone https://github.com/taoman26/SceneExplorer.git
```

以下のコマンドでビルドします。
```
$ cd SceneExplorer
$ sh prepareGitrev.sh
$ mkdir build
$ cd build
$ qmake ../src/SceneExplorer.pro
$ make
```

> **注**: `prepareGitrev.sh` はAboutダイアログに表示されるgitコミットハッシュを含む
> `src/gitrev.h` を生成します。初回ビルド前と、ソースを更新するたびに実行してください。

実行
```
./SceneExplorer
```

### Haiku
以下のコマンドでソースとビルドツールを取得します。
```
git clone https://github.com/taoman26/lsMisc.git
git clone https://github.com/taoman26/SceneExplorer.git
```

以下のコマンドでビルドします。
```
$ cd SceneExplorer
$ sh prepareGitrev.sh
$ mkdir build
$ cd build
$ qmake ../src/SceneExplorer.pro
$ make
```

> **注**: `prepareGitrev.sh` はAboutダイアログに表示されるgitコミットハッシュを含む
> `src/gitrev.h` を生成します。初回ビルド前と、ソースを更新するたびに実行してください。

デスクバーの Applications メニューに追加するには：
```
mkdir -p ~/config/settings/deskbar/menu/Applications
ln -s $(pwd)/SceneExplorer ~/config/settings/deskbar/menu/Applications/SceneExplorer
```

実行
```
./SceneExplorer
```


## サポート
```
For Windows Users, post *Issue* on <https://github.com/ambiesoft/SceneExplorer/issues>.

For Linux and Haiku Users, post *Issue* on <https://github.com/taoman26/SceneExplorer/issues>.
```

## 寄付
Ambiesoftでは寄付を募集しています。詳しくは<https://ambiesoft.github.io/webjumper/?target=donate>を御覧ください。

## コンタクト
- 作者: Ambiesoft trueff
- E-mail: <ambiesoft.trueff@gmail.com>
- ウェブページ: <https://ambiesoft.github.io/webjumper/?target=home>
- 掲示板: <https://ambiesoft.github.io/webjumper/?target=bbs>
- 開発: <https://github.com/ambiesoft/SceneExplorer>


## 法的情報
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

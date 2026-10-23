# music-pane

A music player in a pane beside the chat. It plays your albums and YouTube with `mpv`, searches by title, singer or a line of the lyrics, keeps going with similar songs, and shows the cover, a progress bar with the time, and the lyric line being sung, kept in step with the position `mpv` reports.

## Install

At the prompt of a terminal session:

```
/plugin install music-pane --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

From a shell:

```
claude plugin install music-pane --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `DiegoFernandoLojanTenesaca/indaga-mods`, then Add plugin.

It needs [mpv](https://mpv.io/installation/) to play, `ffmpeg` from [FFmpeg](https://ffmpeg.org/download.html) for the covers, and [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube. The mod hands mpv a small Lua script of its own (`player/control.lua`) that reads a control file the mod writes, one per chat, so volume, pause and a jump in the song change while it plays, with no gap and nothing heard twice, and a chat never steers the player of another.

On Windows:

```
winget install mpv-player.mpv-CI.MSVC
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

A program installed while Claude Code (or the app that runs it) was open is found once that app starts again; or set its full path in the `player`, `ytdlp` and `ffmpeg` options. Keep yt-dlp current (`winget upgrade yt-dlp.yt-dlp`): YouTube changes often, and an old yt-dlp stops reading it.

mpv plays on the computer where Claude Code runs. From an app that reaches that computer from elsewhere (CConnect on a phone, say), the sound comes out of that computer.

## Options

| Option | What it is |
|---|---|
| `library` | The music folder, with one subfolder per album. |
| `channel` | A YouTube channel (`@name` or its URL) whose playlists show as albums. |
| `artist` | The artist of the music folder: searched with its songs, and taken off the front of YouTube titles. |
| `player`, `ffmpeg`, `ytdlp` | The executables, by name on the PATH or by full path. |
| `openOnStart` | Open the pane when a session starts. On by default. |

## Opening it

The pane opens when a session starts. Closed, it opens again with `/music` in a terminal session, or by asking Claude for music wherever `/music` does not run (the desktop app and other hosts).

## Searching

The search field takes a title, a singer, a line of the lyrics or a YouTube link. It looks through the music folder (titles, albums, the artist and every line of the lyrics) and YouTube, and lists both. When nothing in the folder matches but a title or a line comes close, it asks "Did you mean ...?", and that line plays the song. A link adds the video or playlist as an album.

Asked for music in the chat ("play some romantic salsa", "put on the song that goes ..."), Claude searches the same way through the mod's `play` tool and plays the best match, which also works where the pane has no text field.

## Similar songs

With "Similar songs next" on, which is the default, the radio goes on when an album ends, and right after a song picked from a search: it plays YouTube's mix of that song, the songs YouTube lists as like it, by the same singer or others, skipping what it already played and other uploads of the same song (a live take, a lyric video). For a song from the music folder it starts from the song's YouTube video, found by its title and the artist. Off, it stops at the end of the album.

## The music folder

```
library/
├── First Album/
│   ├── Cover.png
│   ├── Songs/01 - Opening.mp3
│   ├── Songs/01 - Opening.txt
│   └── Videos/01 - Opening.srt
└── Second Album/
    └── 01 - Another.mp3
```

Each subfolder of `library` is an album. A song is an audio file (`.mp3`, `.flac`, `.ogg`, `.opus`, `.m4a`, `.wav`) in the album folder or one level below it. Its lyrics are the `.srt` of the same name, shown line by line as they are sung, or else the `.txt` of the same name, shown whole. An image in the album folder is its cover, one named cover, folder, front or portada first. Folders whose name starts with a dot are skipped.

## YouTube

The playlists of `channel` show as albums next to the local ones. A video plays its audio, with its uploaded subtitles as the synced lyrics and its thumbnail as the cover. Starting a YouTube song takes a few seconds while yt-dlp reads it. A song of up to 10 MB (about ten minutes) is asked of YouTube whole, in one piece: it arrives in under a second and the network stays quiet while it plays, which helps Bluetooth headphones that share their radio with a 2.4 GHz Wi-Fi. A longer one streams as it plays.

## The pane

Before anything plays it greets with a banner in the theme color, a few searches to start with, and the songs played lately (kept between sessions).

Once something plays, from the top: the search field, then the results of the last search (closed with Close, or by picking a song), then what is playing: a wide cover, the title, the singer and the album, a progress bar with the time on each side, the controls in the middle with the volume beside them, and "Similar songs next" under them; the YouTube link sits at the right of the title. Below come the lyrics, the next five songs, and the library (the music folder, the channel's playlists and pasted links), which shows only when there is one. Every option may stay empty: the search works alone.

## Using it

Search, or pick an album in the library, then a song. ❚❚ pauses and ⏵ goes on from the same instant. Drag or click the progress bar to move through the song, as on YouTube: the player jumps there when you let go, without starting again, and a paused song goes on from there (the phone and the editor show the bar without moving it). Drag or click the volume bar too; where the surface has no such bar (the phone, the editor), − and + move it by 10. The color dots at the bottom of the pane pick the theme (pink, red, orange, yellow, green, cyan, blue or purple), which colors the play button, the bars, the banner, the line being sung and the song playing. Volume and theme are kept for the next session.

A YouTube song is read over a connection YouTube sometimes drops; mpv reconnects, and a song that still ends more than five seconds early starts again where it stopped, twice at most, instead of skipping to the next one. A YouTube song that never starts is asked of YouTube again, twice at most, before the pane gives up on it.

## When it does not play

The pane says why, in mpv's own words where it has them:

- **Could not run mpv:** mpv is not installed, or not where the `player` option says. The same message names yt-dlp when a search or a YouTube song cannot run it.
- **mpv could not play a song, and the reason:** mpv started and gave up on that song, as with `HTTP error 403 Forbidden` from YouTube. Update yt-dlp first when YouTube songs stop playing.
The small covers are made once with `ffmpeg` and kept in the system's temporary folder. Nothing else leaves your computer but what YouTube is asked for.

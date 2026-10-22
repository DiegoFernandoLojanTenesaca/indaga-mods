# indaga-mods

Claude Code mods by IndagaLab. Each one lives in `plugins/<name>/` with its own README.

| Mod | What it does | Needs |
|---|---|---|
| [`music-pane`](plugins/music-pane) | A music player in a pane beside the chat: your albums and YouTube, a search by title, singer or a line of the lyrics, similar songs after each one, the cover, a progress bar and the lyric line being sung. | mpv, yt-dlp and ffmpeg (see its README) |
| [`mail-pane`](plugins/mail-pane) | Your latest mail in a pane beside the chat, through the Microsoft 365 connector: one sender domain or the whole inbox, read in the pane, passed to the chat, a toast when new mail comes in. | The Microsoft 365 connector, connected |
| [`review-pane`](plugins/review-pane) | Your GitHub pull requests and GitLab merge requests in a pane beside the chat: what waits for your review, yours and the ones you take part in, or every one of a project you pick, with their checks, and one press to review one in the chat. | `gh` or `glab`, signed in |
| [`xyra-alert`](plugins/xyra-alert) | Toasts from Xyra while you work: a League of Legends match found, accepted, back in the queue, and the game starting with your champion. | [Xyra](https://xyra-app.pages.dev) with its phone link on |

## Install

At the prompt of a terminal session:

```
/plugin install <mod> --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

From a shell:

```
claude plugin install <mod> --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `DiegoFernandoLojanTenesaca/indaga-mods`, then Add plugin.

To update later: `claude plugin marketplace update indaga-mods`, then `claude plugin update <mod>@indaga-mods` and `/reload-plugins`.

## In CConnect

CConnect draws the panes beside the chat once two of its settings are on: **Persistent sessions** and the mods one (**Show what mods report in any chat, and their panes and band in persistent chats**). Install from a shell with the line above, in CConnect's main account (`~/.claude`, with no `CLAUDE_CONFIG_DIR` set): CConnect copies the plugins it enables and their options to its other accounts. The panes show once a message is sent in the chat, each in its own tab of the Mods panel on the right.

## Developing

`scripts/check.sh` validates the marketplace and every mod, and runs their tests.

## License

[MIT](LICENSE)

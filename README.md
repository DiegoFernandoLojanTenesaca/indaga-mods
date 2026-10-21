# indaga-mods

Claude Code mods by IndagaLab. Each one lives in `plugins/<name>/` with its own README.

| Mod | What it does |
|---|---|
| [`music-pane`](plugins/music-pane) | A music player in a pane beside the chat: your albums and YouTube, a search by title, singer or a line of the lyrics, similar songs after each one, the cover, a progress bar and the lyric line being sung. |
| [`mail-pane`](plugins/mail-pane) | Your latest mail in a pane beside the chat, through the Microsoft 365 connector: one sender domain or the whole inbox, read in the pane, passed to the chat, a toast when new mail comes in. |
| [`review-pane`](plugins/review-pane) | Your GitHub pull requests and GitLab merge requests in a pane beside the chat: what waits for your review, yours and the ones you take part in, or every one of a project you pick, with their checks, and one press to review one in the chat. |

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

## Developing

`scripts/check.sh` validates the marketplace and every mod, and runs their tests.

## License

[MIT](LICENSE)

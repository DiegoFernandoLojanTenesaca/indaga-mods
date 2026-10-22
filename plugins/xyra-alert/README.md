# xyra-alert

Toasts from [Xyra](https://xyra-app.pages.dev) while you work with Claude, so a League of Legends match never waits on you:

| In League of Legends | Toast |
|---|---|
| A match is found | Match found! |
| It is accepted and champion select starts | Xyra accepted it. Champion select. (or Match accepted, when Xyra does not accept on its own) |
| Someone does not accept | Someone did not accept. You are still in the queue. (or The match did not start, once out of the queue) |
| The game starts | The game started: your champion. |

What the game already shows when a session starts is not announced. The toasts follow Claude Code's language (English or Spanish).

## Install

At the prompt of a terminal session:

```
/plugin install xyra-alert --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

From a shell:

```
claude plugin install xyra-alert --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

## How it reaches Xyra

It needs Xyra on the same computer with its phone link on. At the first session it pairs on its own, with the pairing code Xyra keeps in `%APPDATA%\com.indagalab.xyra\config.json`, and shows up among Xyra's phones as Claude Code. Then it listens to Xyra the way the phone app does (`/api/state`). While Xyra is closed it tries again every 30 seconds and says nothing.

Disconnecting Claude Code from Xyra's phones stops it for that session; it pairs again at the next one, so turn the mod off to stop it for good.

## Options

| Option | What it is |
|---|---|
| `address` | Where Xyra's phone link answers. `http://127.0.0.1:47811` by default. |

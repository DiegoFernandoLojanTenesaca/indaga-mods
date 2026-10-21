# mail-pane

Your latest mail in a pane beside the chat, through the Microsoft 365 connector of Claude: the mail of one sender domain, or the newest of the inbox, read right there, passed to the chat in one press, and a toast when new mail comes in.

## Install

At the prompt of a terminal session:

```
/plugin install mail-pane --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

From a shell:

```
claude plugin install mail-pane --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `DiegoFernandoLojanTenesaca/indaga-mods`, then Add plugin.

It needs the Microsoft 365 connector connected in the session (claude.ai, Settings, Connectors). The mod calls it with the session's own connection and asks for nothing else.

## Options

| Option | What it is |
|---|---|
| `domain` | Only mail sent from this domain or address (`example.com`). Empty shows the newest mail of the inbox. |
| `watch` | Addresses or names, separated by commas, whose new mail raises a toast. Empty: every new mail of the domain does. |
| `refreshMinutes` | How often the pane looks for new mail. 5 by default. |
| `connector` | The connector's name as `/mcp` lists it. `claude.ai Microsoft 365` by default. |
| `openOnStart` | Open the pane when a session starts. On by default. |

## The pane

A banner in the theme color says the domain and how many mails are unread. Under it come the search (words of the subject, the body or an attachment), All and Unread, Refresh, and the list: a dot for the unread, who sent it, the subject, how long ago and whether it has an attachment, with Show more at the end.

A press opens a mail: its subject, From, To and Cc, and its text, the newest part first, with Show the whole thread for the quoted rest, and its attachments. Pass to the chat puts the mail in the prompt box, so you can ask Claude about it; where the prompt cannot be filled it copies the mail instead. Open in Outlook opens it on the web.

The pane looks for new mail every few minutes. A toast says who wrote and the subject of each new one from the watched senders; the first look after the mod starts only remembers where the mail stands. The color dots at the bottom pick the theme, kept for the next session.

Reading a mail here does not mark it read in Outlook.

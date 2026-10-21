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
| `saveFolder` | Where each mail is saved with its attachments, one folder per mail. Empty: a Mail folder in Downloads. |
| `openOnStart` | Open the pane when a session starts. On by default. |

## The pane

A banner in the theme color says the domain and how many mails are unread. Under it come the search (words of the subject, the body or an attachment), All and Unread, Refresh, and the list: a dot for the unread, who sent it, the subject, how long ago and whether it has an attachment, with Show more at the end.

A press opens a mail: its subject, From, To and Cc, its attachments, and its text, the newest part first, with Show the whole thread for the quoted rest. View shows an attachment in the pane: a text or Markdown file as it is, an image as a picture; other files (a PDF, a spreadsheet) are opened from the saved folder.

Save writes the mail (`mail.md`, the whole thread) and every attachment into a folder of its own, `<date> <subject>`. Pass to the chat saves it the same way and puts the mail in the prompt box with that folder and its files, so the session can read the attachments and work on them; where the prompt cannot be filled it copies the text instead. Open in Outlook opens it on the web.

An attachment comes from the connector as text or as bytes; bytes are written with the system's own decoder, `certutil` on Windows and `base64` elsewhere.

The pane looks for new mail every few minutes. A toast says who wrote and the subject of each new one from the watched senders; the first look after the mod starts only remembers where the mail stands. The color dots at the bottom pick the theme, kept for the next session.

Reading a mail here does not mark it read in Outlook.

# review-pane

Your pull requests and merge requests in a pane beside the chat: the GitHub and GitLab ones that wait for your review, yours, the ones assigned to you and the ones you take part in, each with its checks, a toast when someone asks for your review, and one press to review one in the chat.

## Install

At the prompt of a terminal session:

```
/plugin install review-pane --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

From a shell:

```
claude plugin install review-pane --marketplace DiegoFernandoLojanTenesaca/indaga-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `DiegoFernandoLojanTenesaca/indaga-mods`, then Add plugin.

It reads GitHub with the [GitHub CLI](https://cli.github.com) and GitLab with the [GitLab CLI](https://gitlab.com/gitlab-org/cli), each signed in once (`gh auth login`, `glab auth login`). It asks for no token of its own.

## Options

| Option | What it is |
|---|---|
| `github` | Show the GitHub pull requests. On by default. |
| `gitlab` | Show the GitLab merge requests. On by default. |
| `gh` | The GitHub CLI command, or its full path when it is not on the PATH. `gh` by default. |
| `glab` | The GitLab CLI command, or its full path. `glab` by default. |
| `refreshMinutes` | How often the pane looks again. 5 by default. |
| `openOnStart` | Open the pane when a session starts. On by default. |

## The pane

A banner in the theme color says how many requests wait for your review and how many are open. Under it, one section per host, each in groups: asked to review, yours, assigned to you, you take part, and the last few closed. A row shows the check state (✓ passed, ✗ failed, ● running), the repository and number, the title, who opened it, how long ago it changed, and whether it is a draft, approved, waiting for review, with changes requested or with conflicts.

A press opens one: its branches, the lines added and removed, its checks (the failing first, each a link to its run), its reviewers and its description. Review in the chat puts the request in the prompt box with the command that shows its changes (`gh pr diff`, `glab mr diff`), so the session can read them and review it; where the prompt cannot be filled it copies the text instead. Open in GitHub or GitLab opens it on the web.

GitHub is read with one GraphQL search (`review-requested:@me`, `involves:@me`); GitLab with the `reviews_for_me`, `created_by_me` and `assigned_to_me` scopes, never every merge request of the instance. A toast names whoever asks for your review; the first look after the mod starts only remembers what is there. The color dots at the bottom pick the theme, kept for the next session.

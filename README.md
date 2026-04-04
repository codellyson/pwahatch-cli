# pwahatch

Submit PWAs to [Hatch](https://pwahatch.vercel.app) from your terminal. Zero dependencies.

## Quick start

```sh
npx pwahatch login
npx pwahatch submit https://your-pwa.com
```

The CLI crawls your site's web app manifest, shows a preview, then walks you through category and visibility before submitting.

```
  Crawling https://monieplan.xyz...

  ✓ Found manifest
    Name:        MoniePlan
    Description: Your personalized budget in minutes.
    Icons:       6 found
    Theme:       #009957

  Categories:
     1. business
     2. education
     ...
    12. productivity

  Pick a number (enter to skip): 12
  Public? (Y/n): Y

  Submitting...

  ✓ Submitted! Install page: https://pwahatch.vercel.app/monieplan-a3kx9f
```

## Commands

### `pwahatch login`

Authenticate with your Hatch account. Prompts for email and password, then stores the session token locally.

```sh
pwahatch login                          # defaults to production
pwahatch login --url http://localhost:3000   # point at a local dev server
```

### `pwahatch submit <url>`

Submit a PWA. The URL must point to a site with a valid web app manifest.

```sh
pwahatch submit https://your-pwa.com
```

Skip the interactive prompts with flags:

```sh
pwahatch submit https://your-pwa.com --category productivity --private
```

| Flag | Description |
|---|---|
| `--category <name>` | Set the category (see list below) |
| `--private` | List the app as private |
| `--public` | List the app as public (default) |

### `pwahatch logout`

Clear the stored session token.

```sh
pwahatch logout
```

## Categories

`business` `education` `entertainment` `finance` `food & drink` `games` `health & fitness` `lifestyle` `music` `news` `photo & video` `productivity` `shopping` `social` `sports` `travel` `utilities` `weather`

Pass any of these to `--category`. The value is case-insensitive.

## Configuration

Session data is stored at `~/.pwahatch/config.json` with `0600` permissions. The file contains your session token and the base URL of the Hatch server you logged into.

To switch servers, log in again with a different `--url`. To reset everything, run `pwahatch logout`.

## Requirements

- Node.js 18.15 or later
- A [Hatch](https://pwahatch.vercel.app) account

## License

MIT

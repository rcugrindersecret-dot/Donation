# Roblox Donation Card Service

A Node.js service for generating custom Roblox donation cards and sending them to a Discord webhook.

## Render settings

- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node.js 20 or newer

## Environment variables

Required:

- `DISCORD_WEBHOOK_URL` — Discord webhook URL for the donation channel.
- `DONATION_API_KEY` — secret key expected in the `x-api-key` request header.

Emoji values (use Discord's full custom emoji syntax):

- `NUKE_EMOJI` — e.g. `<:nuke:1566168077060669510>`
- `SMITE_EMOJI` — e.g. `<:smite:1566168613319090257>`
- `STARFALL_EMOJI` — e.g. `<:starfall:1566167733589123092>`
- `ROBUX_EMOJI` — e.g. `<:robux:1566168953967869982>`

Optional:

- `ROBUX_ICON_COLOR` — six-digit hex color such as `#E52BEB`. When omitted, the Robux icon is tinted to match each donation tier.

## Endpoint

`POST /donation` with JSON fields `donatorName`, `donatorId`, `raiserName`, `raiserId`, `amount`, and optional `dateLabel`. Authenticate with `x-api-key`.

The service sends one Discord embed containing the donation text and the generated donation-card image.

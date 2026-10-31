# Roblox Donation Card Service

A small Express service for generating PNG donation cards and sending them to a Discord webhook.

## Render settings
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`

Set these environment variables in Render:
- `DISCORD_WEBHOOK_URL`: your regenerated Discord webhook URL
- `DONATION_API_KEY`: a long random secret used by your Roblox server script

## Request
POST `/donation` with header `x-api-key: YOUR_DONATION_API_KEY` and JSON body:

```json
{
  "donatorName": "DonatorUsername",
  "donatorId": 123456,
  "raiserName": "RecipientUsername",
  "raiserId": 654321,
  "amount": 100000,
  "dateLabel": "10/31/2026, 2:40 PM"
}
```

Only server-side Roblox scripts should call this endpoint. Do not put the API key in a LocalScript.


Optional Discord custom emoji environment variables:

- `NUKE_EMOJI`
- `SMITE_EMOJI`
- `STARFALL_EMOJI`
- `ROBUX_EMOJI`

For custom server emojis, use Discord's full emoji markup, for example `<:nuke:123456789012345678>`, not just `:nuke:`. If these variables are omitted, the service uses Unicode fallback symbols.

import express from 'express';
import sharp from 'sharp';
import crypto from 'node:crypto';

const app = express();
app.use(express.json({ limit: '32kb' }));

const PORT = process.env.PORT || 10000;

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const FAKE_WEBHOOK_URL = process.env.FAKE_DISCORD_WEBHOOK_URL;

const API_KEY = process.env.DONATION_API_KEY;

const TIERS = [
  { min: 100000, max: 999999, name: 'NUKE', color: '#e52beb', emoji: process.env.NUKE_EMOJI || '💥' },
  { min: 1000000, max: 9999999, name: 'SMITE', color: '#40b6ff', emoji: process.env.SMITE_EMOJI || '⚡' },
  { min: 10000000, max: 999999999, name: 'STARFALL', color: '#ff1c8a', emoji: process.env.STARFALL_EMOJI || '🌠' }
];

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&"']/g, char => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[char]);
}

function formatNumber(value) {
  return Math.floor(value).toLocaleString('en-US');
}

async function getAvatar(userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  try {
    const response = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return null;
    const result = await response.json();
    const imageUrl = result?.data?.[0]?.imageUrl;
    if (!imageUrl) return null;
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imageResponse.ok) return null;
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (imageBuffer.length > 5 * 1024 * 1024) return null;
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function avatarSvg(dataUri, cx, cy, clipId, fallbackText) {
  const image = dataUri
    ? `<image href="${dataUri}" x="${cx - 43}" y="${cy - 43}" width="86" height="86" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
    : `<circle cx="${cx}" cy="${cy}" r="40" fill="#46514e"/><text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeXml(fallbackText.slice(0, 1).toUpperCase())}</text>`;
  return `${image}<circle cx="${cx}" cy="${cy}" r="45" fill="none" stroke="${'__ACCENT__'}" stroke-width="4"/>`;
}

function makeSvg({ donorName, recipientName, amount, donorAvatar, recipientAvatar, dateLabel, accent, robuxIcon }) {
  const formatted = formatNumber(amount);
  const safeDonor = escapeXml(donorName);
  const safeRecipient = escapeXml(recipientName);
  const safeDate = escapeXml(dateLabel);
  const donor = avatarSvg(donorAvatar, 190, 130, 'donorClip', donorName).replaceAll('__ACCENT__', accent);
  const recipient = avatarSvg(recipientAvatar, 710, 130, 'recipientClip', recipientName).replaceAll('__ACCENT__', accent);
  const amountWidth = formatted.length * 29;
  const groupWidth = 58 + 14 + amountWidth;
  const groupStart = 450 - groupWidth / 2;
  const iconMarkup = robuxIcon
    ? `<image href="${robuxIcon}" x="${groupStart}" y="96" width="58" height="58" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  return `
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="900" height="340" viewBox="0 0 900 340">
    <defs>
      <clipPath id="cardClip"><rect x="2" y="2" width="896" height="336" rx="34"/></clipPath>
      <clipPath id="donorClip"><circle cx="190" cy="130" r="42"/></clipPath>
      <clipPath id="recipientClip"><circle cx="710" cy="130" r="42"/></clipPath>
      <linearGradient id="cardShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#333d3a"/><stop offset="1" stop-color="#303a37"/></linearGradient>
    </defs>
    <g clip-path="url(#cardClip)">
      <rect width="900" height="340" fill="url(#cardShade)"/>
      <rect x="0" y="0" width="9" height="340" rx="5" fill="${accent}"/>
      <rect x="2" y="2" width="896" height="336" rx="34" fill="none" stroke="#46514e" stroke-width="3"/>
      ${donor}
      ${recipient}
      <g font-family="Arial, Helvetica, sans-serif" fill="#f4f4f4">
        <text x="190" y="218" text-anchor="middle" font-size="19" font-weight="700">@${safeDonor}</text>
        <text x="710" y="218" text-anchor="middle" font-size="19" font-weight="700">@${safeRecipient}</text>
        ${iconMarkup}
        <text x="${groupStart + 72}" y="139" text-anchor="start" font-size="51" font-weight="800" fill="${accent}" stroke="#171b1a" stroke-width="2" paint-order="stroke">${formatted}</text>
        <text x="450" y="169" text-anchor="middle" font-size="31" font-weight="700">donated to</text>
        <text x="42" y="292" font-size="25" fill="#e1e5e3">Donated on | ${safeDate}</text>
      </g>
    </g>
  </svg>`;
}

async function getRobuxIcon(accent) {
  const emojiMarkup = String(process.env.ROBUX_EMOJI || '').match(/<a?:\w+:(\d+)>/);
  const emojiId = emojiMarkup?.[1];
  if (!emojiId) return null;

  try {
    const response = await fetch(
      `https://cdn.discordapp.com/emojis/${emojiId}.png?size=128&quality=lossless`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return null;
    const original = Buffer.from(await response.arrayBuffer());
    if (original.length > 1024 * 1024) return null;

    // Tint the server's Robux emoji to match the current donation tier.
    const configuredColor = process.env.ROBUX_ICON_COLOR;
    const iconColor = configuredColor && /^#[0-9a-fA-F]{6}$/.test(configuredColor)
      ? configuredColor
      : accent;
    const tinted = await sharp(original)
      .resize(64, 64, { fit: 'contain' })
      .greyscale()
      .tint(iconColor)
      .png()
      .toBuffer();
    return `data:image/png;base64,${tinted.toString('base64')}`;
  } catch (error) {
    console.warn('Could not load the Robux emoji:', error.message);
    return null;
  }
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

app.get('/', (_req, res) => res.status(200).send('Donation card service is running.'));

app.post('/donation', async (req, res) => {
if (!API_KEY || !WEBHOOK_URL || !FAKE_WEBHOOK_URL) {
    return res.status(503).json({ error: 'Service environment is not configured.' });
  }
  if (!constantTimeEqual(req.get('x-api-key'), API_KEY)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const amount = Number(req.body?.amount);
  const donorId = Number(req.body?.donatorId);
  const recipientId = Number(req.body?.raiserId);
  // Roblox names may already include a leading @; strip it so Discord shows only one.
  const donorName = String(req.body?.donatorName ?? 'Unknown').replace(/^@+/, '').slice(0, 32);
  const recipientName = String(req.body?.raiserName ?? 'Unknown').replace(/^@+/, '').slice(0, 32);
  const tier = TIERS.find(item => amount >= item.min && amount <= item.max);

  if (!Number.isSafeInteger(amount) || !tier ||
      !Number.isSafeInteger(donorId) || donorId <= 0 ||
      !Number.isSafeInteger(recipientId) || recipientId <= 0) {
    return res.status(400).json({ error: 'Invalid donation data or unsupported donation amount.' });
  }

  try {
    const [donorAvatar, recipientAvatar] = await Promise.all([
      getAvatar(donorId), getAvatar(recipientId)
    ]);
    const dateLabel = String(req.body?.dateLabel || new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', month: '2-digit', day: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(new Date()));

    const robuxIcon = await getRobuxIcon(tier.color);
    const svg = makeSvg({ donorName, recipientName, amount, donorAvatar, recipientAvatar, dateLabel, accent: tier.color, robuxIcon });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    const form = new FormData();
    const robuxEmoji = process.env.ROBUX_EMOJI || '💰';
    const message = `${tier.emoji} \`@${donorName}\` donated ${robuxEmoji} **${formatNumber(amount)} Robux** to \`@${recipientName}\``;


    // Send message outside the embed, with one image-only embed.
    form.append('payload_json', JSON.stringify({
      content: message,
      embeds: [{
      image: { url: 'attachment://donation.png' }
      }]
    }));

    form.append('files[0]', new Blob([png], { type: 'image/png' }), 'donation.png');

const webhookUrl = req.body?.fake === true
    ? FAKE_WEBHOOK_URL
    : WEBHOOK_URL;

const discordResponse = await fetch(webhookUrl, {
    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      console.error('Discord webhook error:', discordResponse.status, details);
      return res.status(502).json({ error: 'Discord rejected the webhook request.' });
    }

    return res.status(200).json({ success: true, tier: tier.name });
  } catch (error) {
    console.error('Donation processing failed:', error);
    return res.status(500).json({ error: 'Could not create or send donation card.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Donation card service listening on port ${PORT}`);
});

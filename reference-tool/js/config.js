/**
 * config.js — the only file that needs editing when channel details change.
 *
 * Keeping this separate means the tool code never contains a hard-coded
 * handle, and changing the channel is a one-line edit rather than a search
 * across the project.
 */
export const CHANNEL = {
  name: 'Tech Tips Dhanwala MH',
  handle: '@TechTipsDhanwalaMH',
  // ?sub_confirmation=1 makes YouTube show the confirmation prompt directly.
  subscribeUrl: 'https://www.youtube.com/@TechTipsDhanwalaMH?sub_confirmation=1',
  channelUrl: 'https://www.youtube.com/@TechTipsDhanwalaMH',

  // Set this to the video that walks through this tool. Until it is set, the
  // "watch the walkthrough" link is hidden rather than pointing nowhere.
  walkthroughUrl: '',

  // Shown in the share text.
  shareText: 'Free tool to resize exam photos and signatures to the exact required size. Runs in your browser, nothing is uploaded.',
};

/** WhatsApp / Telegram share targets for the current page. */
export function shareLinks(url, text = CHANNEL.shareText) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
  };
}

// Which devices can see the family pages, and turning one off (a lost phone, a link that leaked).
//   node scripts/devices.mjs               # list: id, whose, how it was set up, version, last opened
//   node scripts/devices.mjs revoke <id>   # that device drops to the public Grandparents page
// A revoked device can be set up again with a parent's or the kids' code.

import { adminToken, rpc } from './admin.mjs';

const [cmd, id] = process.argv.slice(2);
const token = adminToken();

if (cmd === 'revoke') {
  if (!id) { console.error('Usage: node scripts/devices.mjs revoke <8-character id>'); process.exit(1); }
  const n = await rpc('ec_revoke', { p_admin: token, p_id: id });
  console.log(n ? `Revoked ${n} device${n > 1 ? 's' : ''}.` : 'No active device with that id.');
} else {
  const list = await rpc('ec_devices', { p_admin: token });
  const day = (t) => (t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  console.log(['id      ', 'name                 ', 'me      ', 'how          ', 'ver ', 'last opened'].join('  '));
  for (const d of list) {
    console.log([d.id, (d.name || d.device || '').padEnd(21).slice(0, 21), (d.me || '').padEnd(8), d.how.padEnd(13), String(d.version || '').padEnd(4),
      d.revoked ? `REVOKED ${day(d.revoked)}` : day(d.lastSeen)].join('  '));
  }
  if (!list.length) console.log('(no devices yet)');
}

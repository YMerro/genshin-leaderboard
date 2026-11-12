'use strict';
/* Wish history: import from a wish history link, pity, 50/50 stats and a luck board. Uses helpers from app.js. */

Object.assign(state, { wishes: null, wishesLoading: false, wishesError: null, wishAccount: null,
  importing: false, importMsg: null, importError: false });

const PITY_CAP = { character: 90, weapon: 80, chronicled: 90, standard: 90, beginner: 50 };

async function loadWishes() {
  state.wishesLoading = true;
  try {
    state.wishes = await api('/api/wishes');
    state.wishesError = null;
  } catch (e) {
    state.wishesError = e.message;
  } finally {
    state.wishesLoading = false;
    if (state.tab === 'wishes') render();
  }
}

const accountName = (uid) => {
  const p = state.players.find((x) => x.uid === uid && !x.error);
  return p ? playerName(p) : `UID ${uid}`;
};

function importPanel() {
  return `<form class="panel wish-import" id="wish-form" autocomplete="off">
    <h2>Import wish history</h2>
    <ol class="steps">
      <li>In Genshin on this PC, open <b>Wish → History</b> and let it load.</li>
      <li>In the <code>genshin-leaderboard</code> folder, run:<br>
        <code class="cmd">powershell -ExecutionPolicy Bypass -File scripts\\get-wish-link.ps1</code><br>
        <span class="muted small">It copies your wish history link to the clipboard.</span></li>
      <li>Paste it here. The link works for about 24 hours and is never saved.</li>
    </ol>
    <div class="wish-input">
      <input id="wish-url" type="text" spellcheck="false" placeholder="https://…authkey=…" aria-label="Wish history link" required>
      <button class="btn primary" type="submit" ${state.importing ? 'disabled' : ''}>${state.importing ? 'Importing…' : 'Import'}</button>
    </div>
    ${state.importMsg ? `<p class="form-msg ${state.importError ? 'error' : 'ok'}" role="status">${esc(state.importMsg)}</p>` : ''}
    <p class="muted small">Re-import any time; only new wishes are added, so your history can go back further than the 6 months the game shows.</p>
  </form>`;
}

function pityBar(value, cap, label) {
  const pctFill = Math.min(100, (value / cap) * 100);
  return `<div class="pity"><div class="pity-head"><span>${label}</span><b>${value}<span class="muted">/${cap}</span></b></div>
    <div class="bar"><span style="width:${pctFill}%"></span></div></div>`;
}

function bannerCard(b) {
  const cap = PITY_CAP[b.key] || 90;
  const rate = b.wins + b.losses ? Math.round((b.wins / (b.wins + b.losses)) * 100) : null;
  return `<div class="panel banner">
    <div class="banner-head"><h3>${esc(b.name)}</h3><span class="muted">${int(b.total)} wishes</span></div>
    ${pityBar(b.pity5, cap, '5★ pity')}
    ${pityBar(b.pity4, 10, '4★ pity')}
    <div class="banner-facts">
      ${b.guaranteed != null ? `<span class="title-chip ${b.guaranteed ? '' : 'more'}">${b.guaranteed ? 'Next 5★ guaranteed' : 'On 50/50'}</span>` : ''}
      ${b.fiveStars.length ? `<span>Avg 5★ pity <b>${b.avgPity5}</b></span>` : ''}
      ${rate != null ? `<span>50/50 won <b>${b.wins}/${b.wins + b.losses}</b> (${rate}%)</span>` : ''}
    </div>
    ${b.fiveStars.length ? `<ul class="five-list">${b.fiveStars.map((f) => `<li>
      <span class="five-name">${esc(f.name)}</span>
      <span class="five-bar"><span style="width:${Math.min(100, (f.pity / cap) * 100)}%"></span></span>
      <b class="five-pity">${f.pity}</b>
      ${f.result ? `<span class="result result-${f.result}">${f.result === 'won' ? 'Won' : f.result === 'lost' ? 'Lost' : 'Guaranteed'}</span>` : '<span></span>'}
    </li>`).join('')}</ul>` : '<p class="muted small">No 5★ yet on this banner.</p>'}
  </div>`;
}

function luckBoard(accounts) {
  const rows = accounts.map((a) => {
    const ch = a.banners.find((b) => b.key === 'character');
    const games = ch ? ch.wins + ch.losses : 0;
    return { a, avg: ch && ch.fiveStars.length ? ch.avgPity5 : null, rate: games ? ch.wins / games : null, games };
  }).filter((r) => r.avg != null).sort((x, y) => x.avg - y.avg || (y.rate ?? 0) - (x.rate ?? 0));
  if (rows.length < 2) return '';
  return `<h2 class="h2h-heading">Luck board</h2><p class="muted small">Lowest average 5★ pity on the character banner wins.</p>
    <div class="table-wrap"><table class="board"><thead><tr><th class="rank">#</th><th>Account</th>
      <th class="num">Avg 5★ pity</th><th class="num">50/50 won</th><th class="num">Wishes</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr><td class="rank">${rankBadge(i + 1)}</td><td class="name">${esc(accountName(r.a.uid))}${i === 0 ? ' <span class="title-chip">Luckiest</span>' : i === rows.length - 1 ? ' <span class="title-chip more">Unluckiest</span>' : ''}</td>
      <td class="num active">${r.avg}</td><td class="num">${r.rate == null ? '—' : `${Math.round(r.rate * 100)}% of ${r.games}`}</td>
      <td class="num">${int(r.a.totalPulls)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderWishes() {
  if (!state.wishes) {
    if (!state.wishesLoading && !state.wishesError) loadWishes();
    return state.wishesError ? emptyPanel("Couldn't load wishes", state.wishesError) : '<div class="panel empty">Loading wishes…</div>';
  }
  const accounts = state.wishes;
  if (!accounts.length) return importPanel();

  if (!accounts.some((a) => a.uid === state.wishAccount)) state.wishAccount = accounts[0].uid;
  const a = accounts.find((x) => x.uid === state.wishAccount);
  const ch = a.banners.find((b) => b.key === 'character');

  const picker = accounts.length > 1
    ? `<label>Account <select id="wish-account">${accounts.map((x) => `<option value="${esc(x.uid)}" ${x.uid === a.uid ? 'selected' : ''}>${esc(accountName(x.uid))}</option>`).join('')}</select></label>`
    : `<span class="name">${esc(accountName(a.uid))}</span>`;

  return `<div class="controls">${picker}
      <button class="btn small danger" type="button" data-action="wish-delete" data-uid="${esc(a.uid)}">Delete this history</button></div>
    <div class="tiles">
      <div class="panel tile"><span class="tile-label">Total wishes</span><span class="tile-value">${int(a.totalPulls)}</span></div>
      <div class="panel tile"><span class="tile-label">Primogems spent</span><span class="tile-value">${int(a.primogems)}</span></div>
      ${ch ? `<div class="panel tile"><span class="tile-label">Character pity</span><span class="tile-value">${ch.pity5}</span>
        <span class="sub">${ch.guaranteed ? 'Next 5★ guaranteed' : 'On 50/50'}</span></div>
      <div class="panel tile"><span class="tile-label">50/50 win rate</span><span class="tile-value">${ch.wins + ch.losses ? `${Math.round((ch.wins / (ch.wins + ch.losses)) * 100)}%` : '—'}</span>
        <span class="sub">${ch.wins} won · ${ch.losses} lost</span></div>` : ''}
    </div>
    <div class="banner-grid">${a.banners.map(bannerCard).join('')}</div>
    ${luckBoard(accounts)}
    ${importPanel()}`;
}

async function importWishes(url) {
  state.importing = true;
  state.importMsg = 'Importing… this can take a minute for big histories.';
  state.importError = false;
  render();
  try {
    const result = await api('/api/wishes/import', { method: 'POST', body: JSON.stringify({ url }) });
    state.wishes = result.accounts;
    const added = Object.entries(result.added);
    if (added.length) state.wishAccount = added[0][0];
    const total = added.reduce((s, [, n]) => s + n, 0);
    state.importMsg = total ? `Imported ${int(total)} new wish${total === 1 ? '' : 'es'}.` : 'Already up to date. No new wishes.';
  } catch (e) {
    state.importMsg = e.message;
    state.importError = true;
  } finally {
    state.importing = false;
    render();
  }
}

Object.assign(TABS, { wishes: renderWishes });

view.addEventListener('submit', (e) => {
  if (e.target.id !== 'wish-form') return;
  e.preventDefault();
  const input = document.getElementById('wish-url');
  const url = input.value.trim();
  input.value = '';
  if (url) importWishes(url);
});

view.addEventListener('change', (e) => {
  if (e.target.id === 'wish-account') { state.wishAccount = e.target.value; render(); }
});

view.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action="wish-delete"]');
  if (!el) return;
  if (!confirm(`Delete the saved wish history for ${accountName(el.dataset.uid)}? You can re-import it later (the game only keeps 6 months).`)) return;
  try {
    await api(`/api/wishes/${encodeURIComponent(el.dataset.uid)}`, { method: 'DELETE' });
    state.wishes = state.wishes.filter((a) => a.uid !== el.dataset.uid);
    render();
  } catch (err) {
    alert(err.message);
  }
});

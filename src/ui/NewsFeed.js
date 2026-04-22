// Scrolling news ticker. Continuous RAF marquee; new items append to the
// tail so incoming news never resets position. Items that fully scroll past
// the left edge are removed to cap DOM growth. Every news item is also
// captured in the dispatches log, so the ticker stays purely ambient.

import { EVT } from '../core/EventBus.js';

const DEFAULT_SPEED_PX_PER_SEC = 30;
const MAX_DT_SEC = 0.1;

export class NewsFeed {
  constructor(root, state, bus, { speedPxPerSec = DEFAULT_SPEED_PX_PER_SEC } = {}) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    this.speedPxPerSec = speedPxPerSec;
    this.offset = 0;
    this.lastT = 0;
    this.raf = null;

    this.root.innerHTML =
      `<div class="news-label">LIVE</div>
       <div class="news-viewport" aria-label="News ticker">
         <div class="news-scroll"></div>
       </div>`;
    this.label = this.root.querySelector('.news-label');
    this.viewport = this.root.querySelector('.news-viewport');
    this.scroll = this.root.querySelector('.news-scroll');
    this._breakingFlashTimer = null;
    this._shownIds = new Set();

    for (const item of [...this.state.news].reverse()) this._append(item);

    this._unsub = this.bus.on(EVT.NEWS, (item) => this._append(item));
    this._frame = this._frame.bind(this);
    this.raf = requestAnimationFrame(this._frame);
  }

  _append(item) {
    if (!item || !item.text) return;
    if (item.id && this._shownIds.has(item.id)) return;
    if (item.id) this._shownIds.add(item.id);
    const el = document.createElement('span');
    el.className = `news-item tone-${item.tone || 'flavor'}`;
    el.innerHTML = `<span class="news-date">${item.date}</span> ${item.text}`;
    const sep = document.createElement('span');
    sep.className = 'news-sep';
    sep.innerHTML = '&nbsp;&nbsp;•&nbsp;&nbsp;';
    this.scroll.appendChild(el);
    this.scroll.appendChild(sep);
    if (item.tone === 'breaking') this._flashBreaking();
  }

  // Flip the LIVE chip to "BREAKING" and pulse red for ~5 s, long enough for
  // the headline to traverse a good chunk of the viewport. Consecutive
  // breakings extend the timer instead of stacking.
  _flashBreaking() {
    if (!this.label) return;
    this.label.textContent = 'BREAKING';
    this.label.classList.add('news-label-breaking');
    clearTimeout(this._breakingFlashTimer);
    this._breakingFlashTimer = setTimeout(() => {
      this.label.textContent = 'LIVE';
      this.label.classList.remove('news-label-breaking');
    }, 5000);
  }

  _topUp() {
    const unshown = [];
    for (const item of this.state.news) {
      if (item.id && !this._shownIds.has(item.id)) unshown.push(item);
    }
    unshown.reverse();
    for (const item of unshown) this._append(item);
  }

  _frame(t) {
    if (!this.lastT) this.lastT = t;
    const dt = Math.min(MAX_DT_SEC, (t - this.lastT) / 1000);
    this.lastT = t;
    this.offset += this.speedPxPerSec * dt;

    while (this.scroll.firstElementChild) {
      const first = this.scroll.firstElementChild;
      const w = first.offsetWidth;
      if (w > 0 && this.offset >= w) {
        this.scroll.removeChild(first);
        this.offset -= w;
      } else break;
    }

    this.scroll.style.transform = `translateX(${-this.offset}px)`;

    const vpRect = this.viewport.getBoundingClientRect();
    const scrollRight = this.scroll.getBoundingClientRect().right;
    if (scrollRight - vpRect.right < Math.max(300, vpRect.width * 0.6)) this._topUp();

    this.raf = requestAnimationFrame(this._frame);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this._unsub?.();
  }
}

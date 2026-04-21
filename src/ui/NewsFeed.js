// Scrolling news ticker. Continuous RAF marquee; new items append to the
// tail so incoming news never resets position. Items that fully scroll past
// the left edge are removed to cap DOM growth.

import { EVT } from '../core/EventBus.js';

const DEFAULT_SPEED_PX_PER_SEC = 22;
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
       <div class="news-viewport"><div class="news-scroll"></div></div>`;
    this.viewport = this.root.querySelector('.news-viewport');
    this.scroll = this.root.querySelector('.news-scroll');

    for (const item of [...this.state.news].reverse()) this._append(item);
    this._topUp();

    this._unsub = this.bus.on(EVT.NEWS, (item) => this._append(item));
    this._frame = this._frame.bind(this);
    this.raf = requestAnimationFrame(this._frame);
  }

  _append(item) {
    if (!item || !item.text) return;
    const el = document.createElement('span');
    el.className = `news-item tone-${item.tone || 'flavor'}`;
    el.innerHTML = `<span class="news-date">${item.date}</span> ${item.text}`;
    const sep = document.createElement('span');
    sep.className = 'news-sep';
    sep.innerHTML = '&nbsp;&nbsp;•&nbsp;&nbsp;';
    this.scroll.appendChild(el);
    this.scroll.appendChild(sep);
  }

  _topUp() {
    const vpRect = this.viewport.getBoundingClientRect();
    const vpW = vpRect.width || 600;
    let guard = 0;
    while (guard < 30) {
      const scrollRight = this.scroll.getBoundingClientRect().right;
      if (scrollRight - vpRect.right >= vpW * 1.5) break;
      const recent = this.state.news.slice(0, 20);
      if (!recent.length) break;
      for (const item of recent) this._append(item);
      guard++;
    }
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

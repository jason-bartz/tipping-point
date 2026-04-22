// Scrolling news ticker. Continuous RAF marquee; new items append to the
// tail so incoming news never resets position. Items that fully scroll past
// the left edge are removed to cap DOM growth.
//
// Hover-pause: when the pointer (or keyboard focus) enters the viewport,
// the marquee freezes so the player can read whatever is on screen. A
// "PAUSED" chip in the corner confirms the interaction. Every news item is
// also captured in the dispatches log, so nothing is ever truly lost — the
// ticker is ambient flavor, the log is the record of truth.

import { EVT } from '../core/EventBus.js';

const DEFAULT_SPEED_PX_PER_SEC = 14;
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
    this.paused = false;

    this.root.innerHTML =
      `<div class="news-label">LIVE</div>
       <div class="news-viewport" tabindex="0" aria-label="News ticker. Hover or focus to pause.">
         <div class="news-scroll"></div>
         <div class="news-paused-chip" aria-hidden="true">PAUSED</div>
       </div>`;
    this.viewport = this.root.querySelector('.news-viewport');
    this.scroll = this.root.querySelector('.news-scroll');

    for (const item of [...this.state.news].reverse()) this._append(item);
    this._topUp();

    this._onEnter = () => this._setPaused(true);
    this._onLeave = () => this._setPaused(false);
    this.viewport.addEventListener('mouseenter', this._onEnter);
    this.viewport.addEventListener('mouseleave', this._onLeave);
    this.viewport.addEventListener('focus',      this._onEnter);
    this.viewport.addEventListener('blur',       this._onLeave);

    this._unsub = this.bus.on(EVT.NEWS, (item) => this._append(item));
    this._frame = this._frame.bind(this);
    this.raf = requestAnimationFrame(this._frame);
  }

  _setPaused(v) {
    this.paused = !!v;
    this.root.classList.toggle('news-paused', this.paused);
    // Reset lastT so a long pause doesn't dump a big dt on resume.
    if (!this.paused) this.lastT = 0;
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
    if (this.paused) {
      this.raf = requestAnimationFrame(this._frame);
      return;
    }
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
    this.viewport?.removeEventListener('mouseenter', this._onEnter);
    this.viewport?.removeEventListener('mouseleave', this._onLeave);
    this.viewport?.removeEventListener('focus',      this._onEnter);
    this.viewport?.removeEventListener('blur',       this._onLeave);
  }
}

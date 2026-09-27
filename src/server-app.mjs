import { DEFAULT_SERVER, validateServer, serverTimesForCount, serverId, serverEvents } from './server-config.mjs';
import { seasonalPreviewEvent } from './seasonal-times.mjs';
import { serverHomePayload, serverDraftPayload, serverSchedulePayload, serverMentionPayload, serverReviewPayload, serverModal, serverGuidePayload, serverNoticePayload } from './server-messages.mjs';

export class ServerApp {
  constructor({ store, checkTarget, now = Date.now, token = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16) }) {
    Object.assign(this, { store, checkTarget, now, token });
    this.drafts = new Map();
  }
  prune() { for (const [token, draft] of this.drafts) if (draft.expires <= this.now()) this.drafts.delete(token); }
  forgetGuild(guildId) { for (const [token, draft] of this.drafts) if (draft.guildId === guildId) this.drafts.delete(token); }
  draftFor({ guildId, userId, canManage, action }) {
    this.prune();
    const match = /^server_([a-f0-9]{16})_([a-z_]+)$/.exec(action);
    const draft = match && this.drafts.get(match[1]);
    return canManage && draft?.guildId === guildId && draft.userId === userId ? { draft, token: match[1], op: match[2] } : null;
  }
  modal(input) {
    const found = this.draftFor(input);
    if (!found || !['time_modal', 'zone_modal'].includes(found.op)) return null;
    return serverModal(found.draft.p, found.token, found.op === 'zone_modal' ? 'zone' : 'time');
  }
  async handle(input) {
    const { guildId, userId, canManage, action, values = [] } = input;
    if (action === 'server_guide') return serverGuidePayload(Boolean(guildId && canManage));
    if (!serverId(guildId) || !serverId(userId) || !canManage) return serverNoticePayload('هذه الإعدادات للمشرف', 'افتحها داخل السيرفر بحساب يملك صلاحية إدارة السيرفر.', 'guide');
    const current = this.store.getServer(guildId);
    if (action === 'server_home') {
      for (const [key, draft] of this.drafts) if (draft.guildId === guildId && draft.userId === userId) this.drafts.delete(key);
      return serverHomePayload(current);
    }
    if (action === 'server_pause') {
      this.store.setServer(guildId, { ...current, enabled: false, issue: null });
      this.forgetGuild(guildId);
      return serverHomePayload(this.store.getServer(guildId), 'توقف النشر في القناة. تذكيرات الأعضاء الخاصة باقية كما اختاروها.');
    }
    if (action === 'server_begin') {
      this.prune();
      for (const [key, draft] of this.drafts) if (draft.guildId === guildId && draft.userId === userId) this.drafts.delete(key);
      if (this.drafts.size >= 500) this.drafts.delete(this.drafts.keys().next().value);
      const token = this.token();
      if (!/^[a-f0-9]{16}$/.test(token)) throw new TypeError('Invalid draft token');
      const p = structuredClone(current);
      p.channelId ||= this.store.getPanel(guildId)?.channel_id || null;
      this.drafts.set(token, { guildId, userId, p, base: JSON.stringify(current), expires: this.now() + 15 * 60000, reviewed: false });
      return serverDraftPayload(p, token);
    }
    const found = this.draftFor(input);
    if (!found) return serverNoticePayload('انتهت هذه المعاينة', 'ابدأ الإعداد من جديد. لم نغيّر إعدادات السيرفر.');
    const { draft, token, op } = found;
    const p = draft.p;
    if (op === 'edit') return serverDraftPayload(p, token);
    if (op === 'schedule') return serverSchedulePayload(p, token);
    if (op === 'mention') return serverMentionPayload(p, token);
    if (op === 'review' || op === 'save') {
      if (!p.channelId) return serverDraftPayload(p, token, 'اختر قناة نصية للمنشورات أولًا.');
      if (op === 'save' && !draft.reviewed) return serverDraftPayload(p, token, 'راجع الإعدادات قبل الحفظ.');
      if (JSON.stringify(this.store.getServer(guildId)) !== draft.base) {
        this.drafts.delete(token);
        return serverNoticePayload('تغيّرت إعدادات السيرفر', 'افتح الإعدادات مجددًا حتى لا تستبدل تعديلًا أحدث.');
      }
      const issue = await this.checkTarget({ guildId, userId, preferences: p });
      // Guild removal and expiry can invalidate a draft while Discord is being
      // queried. Never recreate deleted settings from an in-flight save.
      if (this.draftFor(input)?.draft !== draft) return serverNoticePayload('انتهت هذه المعاينة', 'ابدأ الإعداد من جديد. لم نغيّر إعدادات السيرفر.');
      if (JSON.stringify(this.store.getServer(guildId)) !== draft.base) {
        this.drafts.delete(token);
        return serverNoticePayload('تغيّرت إعدادات السيرفر', 'افتح الإعدادات مجددًا حتى لا تستبدل تعديلًا أحدث.');
      }
      if (issue) { draft.reviewed = false; return serverDraftPayload(p, token, issue); }
      if (op === 'review') {
        draft.reviewed = true;
        let event = p.dailyCount ? serverEvents(p, this.now()).find(item => item.kind === 'daily') : null;
        if (!event && p.seasonal) event = { kind: 'seasonal', campaign: seasonalPreviewEvent(this.now()) };
        return serverReviewPayload(p, token, event);
      }
      const saved = { ...p, enabled: Boolean(p.dailyCount || p.seasonal), activatedAt: this.now(), issue: null };
      validateServer(saved);
      this.store.setServer(guildId, saved);
      this.forgetGuild(guildId);
      return serverHomePayload(saved, saved.enabled ? 'حُفظت الإعدادات. يبدأ النشر تلقائيًا في المواعيد القادمة، دون إرسال رسالة الآن.' : 'حُفظت الإعدادات والنشر متوقف.');
    }
    const next = structuredClone(p);
    next.enabled = false; // A draft becomes active only after review and save.
    next.issue = null;
    if (op === 'channel' && values.length === 1 && serverId(values[0])) next.channelId = values[0];
    else if (op === 'count' && values.length === 1 && /^[0-3]$/.test(values[0])) {
      next.dailyCount = Number(values[0]);
      if (next.times.length !== Math.max(1, next.dailyCount)) next.times = serverTimesForCount(next.dailyCount);
    } else if (op === 'seasonal') next.seasonal = !next.seasonal;
    else if (op === 'role' && values.length === 1 && serverId(values[0]) && values[0] !== guildId) { next.roleId = values[0]; next.mentionEveryone = false; }
    else if (op === 'everyone') { next.roleId = null; next.mentionEveryone = true; }
    else if (op === 'no_role') { next.roleId = null; next.mentionEveryone = false; }
    else if ((op === 'zone' || op === 'zone_save') && values.length === 1) next.timezone = String(values[0]).trim();
    else if (op === 'time_save') next.times = values.map(value => String(value).trim().replace(/[٠-٩]/g, n => '٠١٢٣٤٥٦٧٨٩'.indexOf(n)));
    else return serverDraftPayload(p, token, 'لم يُحفظ هذا الخيار. اختر من القائمة المعروضة.');
    try { validateServer(next); }
    catch {
      return op === 'time_save' || op.startsWith('zone') ? serverSchedulePayload(p, token, 'أدخل توقيتًا صالحًا، وساعات بصيغة 20:00 مرتبة وبفاصل ساعة على الأقل.') : serverDraftPayload(p, token, 'تحقق من الاختيارات ثم حاول مجددًا.');
    }
    // Check channel and role permissions before showing the draft as accepted.
    if (['channel', 'role', 'everyone'].includes(op)) {
      const issue = await this.checkTarget({ guildId, userId, preferences: next });
      if (issue) return op !== 'channel' ? serverMentionPayload(p, token, issue) : serverDraftPayload(p, token, issue);
    }
    draft.p = next; draft.reviewed = false;
    return op.startsWith('zone') || op === 'time_save' ? serverSchedulePayload(next, token) : serverDraftPayload(next, token);
  }
}

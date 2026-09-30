import { DHIKR_CARDS, GOOD_DEEDS, PUBLIC_POSTS, SEASONAL_CARDS, DAILY_DHIKR, OCCASION_CARDS } from './content.mjs';
import { noticePayload } from './messages.mjs';

const FORM_TTL = 15 * 60_000;
const DAY_MS = 86_400_000;
const GAP_MS = 10 * 60_000;
const randomToken = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
const feedbackButton = (label, action) => ({ type: 2, style: 2, label, custom_id: `rafiq:v1:${action}` });
const navigation = () => [feedbackButton('رجوع', 'support'), feedbackButton('الرئيسية', 'home')];
const feedbackNotice = (title, body) => noticePayload(title, body, navigation());
const cleanText = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim() : '';
const accountIdentity = ({ id, username } = {}) => {
  const name = cleanText(username).replace(/[\r\n\t]/g, ' ');
  return typeof id === 'string' && /^\d{1,20}$/.test(id) && [...name].length >= 2 && [...name].length <= 32 ? { id, username: name } : null;
};

export function feedbackCard(id) {
  return [...DHIKR_CARDS, ...GOOD_DEEDS, ...PUBLIC_POSTS, ...Object.values(SEASONAL_CARDS), ...DAILY_DHIKR, ...Object.values(OCCASION_CARDS)].find(card => card.id === id) || null;
}

export const isFeedbackForm = action => /^feedback_form_(suggestion|report(?:_[a-z0-9-]+)?)$/.test(action);
export const isFeedbackSubmit = action => /^feedback_submit_[a-f0-9]{24}$/.test(action);

export function feedbackReviewMessage({ ticket, kind, card = null, body, sourceURL = '', reporter }) {
  const identity = accountIdentity(reporter);
  if (!/^[a-f0-9]{24}$/.test(ticket) || !['report', 'suggestion'].includes(kind) || !identity) throw new RangeError('Invalid feedback');
  const context = card ? [`المادة: ${card.id} · ${card.title}`, `المصدر: ${card.source.citations.map(ref => ref.url).join(' · ') || card.source.url}`] : ['ملاحظة عامة'];
  // User text stays inside a code block; mentions and link previews are disabled.
  const literal = cleanText(body).replaceAll('`', 'ˋ');
  const sender = [`المرسل: \`${identity.username.replaceAll('`', 'ˋ')}\``, `معرّف الحساب: \`${identity.id}\``];
  const content = [`${kind === 'report' ? 'بلاغ للمراجعة' : 'اقتراح لرفيق'} · ${ticket}`, ...sender, ...context, '', 'نص الملاحظة:', '```', literal, '```', ...(sourceURL ? [`رابط أضافه المستخدم: <${sourceURL}>`] : []), 'لا يتغير المحتوى تلقائيًا؛ راجع الملاحظة والدليل أولًا.'].join('\n');
  if (content.length > 2000) throw new RangeError('Feedback too long');
  return { content, flags: 4, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } };
}

/** Explicit, disclosed submissions only. Account identity comes from the Discord interaction, never form fields. */
export class FeedbackApp {
  constructor({ send = null, now = Date.now, token = randomToken, onError = () => {} } = {}) {
    Object.assign(this, { send, now, token, onError });
    this.pending = new Map();
    this.attempts = new Map();
    this.globalAttempts = [];
  }
  get enabled() { return typeof this.send === 'function'; }
  prune() {
    const now = this.now();
    for (const [token, item] of this.pending) if (item.expiresAt <= now) this.pending.delete(token);
    for (const [userId, times] of this.attempts) {
      const recent = times.filter(at => at > now - DAY_MS);
      if (recent.length) this.attempts.set(userId, recent); else this.attempts.delete(userId);
    }
    this.globalAttempts = this.globalAttempts.filter(at => at > now - 3_600_000);
  }
  forget(userId) {
    for (const [token, item] of this.pending) if (item.userId === userId) this.pending.delete(token);
    this.attempts.delete(userId);
  }
  modal({ userId, username, action }) {
    const reporter = accountIdentity({ id: userId, username });
    if (!this.enabled || !isFeedbackForm(action) || !reporter) return null;
    const kind = action.startsWith('feedback_form_suggestion') ? 'suggestion' : 'report';
    const id = action.startsWith('feedback_form_report_') ? action.slice('feedback_form_report_'.length) : null;
    const card = id ? feedbackCard(id) : null;
    if (id && !card) return null;
    this.prune();
    if (this.pending.size >= 10_000) return null;
    // Opening a new form replaces this user's abandoned form, without sending anything.
    for (const [key, item] of this.pending) if (item.userId === userId) this.pending.delete(key);
    const token = this.token();
    if (!/^[a-f0-9]{24}$/.test(token) || this.pending.has(token)) throw new Error('Invalid form token');
    this.pending.set(token, { userId, reporter, kind, card, expiresAt: this.now() + FORM_TTL });
    return { custom_id: `rafiq:v1:feedback_submit_${token}`, title: kind === 'report' ? 'بلاغ للمراجعة' : 'اقتراح لرفيق', components: [
      { type: 18, label: kind === 'report' ? 'ما الخطأ الذي لاحظته؟' : 'ما التحسين الذي تقترحه؟', description: 'يُرفق اسم حسابك ومعرّفه؛ ليست مجهولة. تُحذف بعد ٩٠ يومًا. لا تكتب بيانات حساسة.', component: { type: 4, custom_id: 'feedback_body', style: 2, min_length: 10, max_length: 1000, required: true, placeholder: card ? `ملاحظتك على «${card.title}»` : 'اشرح باختصار ما لاحظته أو ما تقترحه.' } },
      ...(kind === 'report' ? [{ type: 18, label: 'رابط دليل أو مصدر — اختياري', component: { type: 4, custom_id: 'feedback_source', style: 1, max_length: 250, required: false, placeholder: 'https://' } }] : [])
    ] };
  }
  async submit({ userId, action, values = [] }) {
    if (!this.enabled) return feedbackNotice('الإرسال غير متاح الآن', 'جرّب فتح نموذج جديد من صفحة المساعدة لاحقًا.');
    this.prune();
    const token = isFeedbackSubmit(action) ? action.slice('feedback_submit_'.length) : null;
    const pending = this.pending.get(token);
    if (!pending || pending.userId !== userId) return feedbackNotice('انتهت صلاحية النموذج', 'افتح نموذجًا جديدًا. لم تُرسل هذه الملاحظة.');
    // Consume before any await: replays and concurrent submissions cannot send twice.
    this.pending.delete(token);
    const body = cleanText(values[0]), sourceURL = cleanText(values[1]);
    if (values.length < 1 || values.length > (pending.kind === 'report' ? 2 : 1) || body.length < 10 || body.length > 1000 || sourceURL.length > 250) return feedbackNotice('راجع الملاحظة', 'اكتب من ١٠ إلى ١٠٠٠ حرف، ثم أعد فتح النموذج.');
    if (sourceURL) {
      try { const url = new URL(sourceURL); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /[\s<>`]/.test(sourceURL)) throw new Error(); }
      catch { return feedbackNotice('راجع رابط المصدر', 'أضف رابطًا كاملًا يبدأ بـ https:// أو http://، أو اتركه فارغًا.'); }
    }
    const now = this.now(), attempts = this.attempts.get(userId) || [];
    if (attempts.length >= 3 || (attempts.length && now - attempts.at(-1) < GAP_MS) || this.globalAttempts.length >= 30 || (!attempts.length && this.attempts.size >= 10_000)) return feedbackNotice('انتظر قبل إرسال ملاحظة أخرى', 'نستقبل حتى ٣ ملاحظات خلال ٢٤ ساعة، بفاصل ١٠ دقائق. قد يتوقف الإرسال مؤقتًا عند كثرة الطلبات.');
    this.attempts.set(userId, [...attempts, now]);
    this.globalAttempts.push(now);
    try {
      await this.send(feedbackReviewMessage({ ticket: token, kind: pending.kind, card: pending.card, body, sourceURL, reporter: pending.reporter }), token);
      return feedbackNotice('وصلت ملاحظتك 🌿', `شكرًا لك. وصلت إلى قناة المراجعة الخاصة بفريق رفيق.\nرقم الملاحظة: ${token}\nنراجعها قبل أي تعديل؛ لا يتغير المحتوى تلقائيًا.`);
    } catch (error) {
      this.onError(error);
      return feedbackNotice('تعذّر تأكيد وصول الملاحظة', `لم نتلقَّ تأكيدًا من ديسكورد. لا نعيد الإرسال تلقائيًا حتى لا تتكرر. احتفظ برقمها وأرسله عبر نموذج البلاغ للمتابعة: ${token}`);
    }
  }
}

import { DHIKR_CARDS, GOOD_DEEDS, dhikrById } from './content.mjs';
import { DAY, MINUTE } from './store.mjs';
import * as ui from './messages.mjs';

export class RafiqApp {
  constructor({ store, queue, sendDM, privacyURL, supportURL, now = Date.now, cancelUser = () => {} }) {
    Object.assign(this, { store, queue, sendDM, privacyURL, supportURL, now, cancelUser });
  }
  state(userId, guildId = null) {
    const user = this.store.getUser(userId);
    return { ...user, paused: user.pausedUntil > this.now(), subscribedHere: guildId ? this.store.isSubscribed(userId, guildId) : true };
  }
  handle(input) { return this.queue.run(input.userId, () => this.route(input)); }

  async route({ userId, guildId = null, action = 'home', values = [] }) {
    const user = this.state(userId, guildId);
    const settings = notice => ui.settingsPayload({ ...this.state(userId, guildId), notice });
    const library = (selectedId, onlyFavorites = false) => ui.libraryPayload({ selectedId, onlyFavorites, favorites: this.store.favorites(userId) });
    if (action === 'home' || action === 'cancel') return ui.homePayload(user);
    if (action === 'preview') return ui.reminderPayload({ ...user, preview: true });
    if (action === 'settings' || action === 'save') return settings('');
    if (action === 'library') return library(DHIKR_CARDS[0].id);
    if (action === 'favorites') return library(null, true);
    if (action === 'methodology') return ui.methodologyPayload();
    if (action === 'privacy') return ui.privacyPayload({ privacyURL: this.privacyURL, supportURL: this.supportURL });
    if (action === 'support') return ui.supportPayload({ supportURL: this.supportURL });
    if (action === 'forget') return ui.forgetPromptPayload();
    if (action === 'forget_confirm') {
      this.cancelUser(userId);
      this.store.forget(userId);
      return ui.noticePayload('حُذفت بياناتك', 'توقفت التنبيهات، ومُحيت تفضيلاتك ومحفوظاتك من قاعدة البوت. لن يُنشأ اشتراك جديد إلا باختيارك.');
    }
    if (action === 'enable') {
      if (guildId) this.store.subscribe(userId, guildId);
      else if (this.store.subscriptions(userId).length) this.store.updateUser(userId, { enabled: true, pausedUntil: 0 });
      else return ui.noticePayload('فعّله من سيرفرك', 'افتح رفيق داخل السيرفر الذي تريده، ثم فعّل تذكير المجلس هناك.');
      if (this.store.getUser(userId).dmBlocked) return settings('حُفظ اشتراكك، لكن الإرسال معلّق حتى ينجح اختبار الخاص.');
      return ui.enabledPayload(this.store.getUser(userId));
    }
    if (action === 'disable') {
      this.cancelUser(userId);
      this.store.updateUser(userId, { enabled: false, pausedUntil: 0, breakAt: null });
      return ui.disabledPayload();
    }
    if (action === 'pause_today') {
      this.cancelUser(userId);
      this.store.updateUser(userId, { pausedUntil: this.now() + DAY, breakAt: null });
      return ui.pausedPayload();
    }
    if (action === 'resume') {
      this.store.updateUser(userId, { pausedUntil: 0 });
      return settings('استُؤنفت التنبيهات التي فعّلتها.');
    }
    if (action === 'frequency' || action === 'delivery') {
      const allowed = action === 'frequency' ? ['daily', 'session'] : ['normal', 'silent'];
      if (values.length !== 1 || !allowed.includes(values[0])) return ui.noticePayload('اختيار غير صالح', 'افتح الإعدادات واختر من القائمة.');
      this.store.updateUser(userId, { [action]: values[0] });
      return settings('✓ حُفظ اختيارك');
    }
    if (action === 'dhikr_select' || action === 'favorite_select') {
      if (values.length !== 1 || !dhikrById(values[0])) return ui.noticePayload('الذكر غير موجود', 'تصفّح المكتبة من مساحتك.');
      return library(values[0], action === 'favorite_select');
    }
    if (action.startsWith('source_') && dhikrById(action.slice(7))) return ui.sourcePayload(action.slice(7));
    if (action.startsWith('card_') && dhikrById(action.slice(5))) return library(action.slice(5));
    if (action.startsWith('favorite_') && dhikrById(action.slice(9))) {
      const cardId = action.slice(9);
      this.store.toggleFavorite(userId, cardId);
      return library(cardId);
    }
    if (action === 'idea' || /^idea_\d+$/.test(action)) {
      const index = action === 'idea' ? 0 : Number(action.slice(5));
      if (index < GOOD_DEEDS.length) return ui.ideaPayload(index);
    }
    if (action === 'break') return ui.breakPayload(user);
    if (action === 'break_cancel') {
      this.store.updateUser(userId, { breakAt: null });
      return ui.breakPayload({ notice: 'أُلغي المؤقّت.' });
    }
    if (['break_15', 'break_30', 'break_60', 'break_90'].includes(action)) {
      if (user.paused) return ui.noticePayload('التنبيهات متوقفة مؤقتًا', 'استأنف التنبيهات من الإعدادات، ثم اضبط مؤقّتك.');
      if (user.dmBlocked) return settings('تعذّر الوصول إلى الخاص سابقًا. افتحه في ديسكورد، ثم اضغط «اختبر الخاص».');
      const breakAt = this.now() + Number(action.slice(6)) * MINUTE;
      this.store.updateUser(userId, { breakAt });
      return ui.breakPayload({ breakAt, notice: '✓ ضُبط مؤقّت واحد لك' });
    }
    if (action === 'test_dm') {
      const now = this.now();
      if (user.lastTestAt !== null && now - user.lastTestAt < MINUTE) return settings('انتظر دقيقة بين اختبارات الخاص.');
      this.store.updateUser(userId, { lastTestAt: now });
      try {
        await this.sendDM(userId, ui.reminderPayload({ silent: user.delivery === 'silent' }), `test:${userId}:${now}`);
        this.store.updateUser(userId, { dmBlocked: false });
        return settings('✓ أُرسلت رسالة تجريبية إلى الخاص');
      } catch (error) {
        if (Number(error.code) === 50007) this.store.updateUser(userId, { dmBlocked: true });
        return settings('لم تصل الرسالة. تأكد من السماح بالرسائل الخاصة من أعضاء السيرفر ومن عدم حظر البوت، ثم جرّب مجددًا.');
      }
    }
    return ui.noticePayload('هذا الخيار لم يعد متاحًا', 'افتح مساحتك لاستخدام الأزرار الحالية.');
  }
}

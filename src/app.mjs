import { DHIKR_CARDS, GOOD_DEEDS, IDEA_CATEGORIES, dhikrById, ideaById } from './content.mjs';
import { DAY, MINUTE } from './store.mjs';
import * as ui from './messages.mjs';

export class RafiqApp {
  constructor({ store, queue, sendDM, privacyURL, supportURL, prayers = null, now = Date.now, cancelUser = () => {}, cancelGuild = () => {} }) {
    Object.assign(this, { store, queue, sendDM, privacyURL, supportURL, prayers, now, cancelUser, cancelGuild });
  }
  state(userId, guildId = null) {
    const user = this.store.getUser(userId);
    return { ...user, inGuild: Boolean(guildId), favoriteCount: this.store.favorites(userId).length + this.store.savedIdeas(userId).length, paused: user.pausedUntil > this.now(), subscribedHere: guildId ? this.store.isSubscribed(userId, guildId) : true };
  }
  handle(input) { return this.queue.run(input.userId, () => this.route(input)); }

  async route({ userId, guildId = null, action = 'home', values = [] }) {
    if (action === 'prayer' || action.startsWith('prayer_')) return this.prayers ? this.prayers.route(userId, action, values) : ui.noticePayload('مواقيت الصلاة', 'تحتاج هذه الميزة إلى تشغيل النسخة المحدّثة من رفيق.');
    const user = this.state(userId, guildId);
    const settings = notice => ui.settingsPayload({ ...this.state(userId, guildId), notice });
    const library = (selectedId, onlyFavorites = false) => ui.libraryPayload({ selectedId, onlyFavorites, favorites: this.store.favorites(userId) });
    const idea = (index = 0, category = 'all') => ui.ideaPayload(index, { category, favorites: this.store.savedIdeas(userId) });
    if (action === 'home' || action === 'cancel') return ui.homePayload(user);
    if (action === 'preview') return ui.reminderPayload({ ...user, preview: true });
    if (action === 'reminder_intro') return ui.reminderIntroPayload(user);
    if (action === 'settings' || action === 'save') return settings('');
    if (action === 'library') return library(DHIKR_CARDS[0].id);
    if (action === 'favorites') return ui.favoritesPayload({ dhikrCount: this.store.favorites(userId).length, ideaCount: this.store.savedIdeas(userId).length });
    if (action === 'saved_dhikr') return library(null, true);
    if (action === 'saved_ideas') return idea(0, 'saved');
    if (action === 'methodology') return ui.methodologyPayload();
    if (action === 'privacy') return ui.privacyPayload({ privacyURL: this.privacyURL, supportURL: this.supportURL });
    if (action === 'support') return ui.supportPayload({ supportURL: this.supportURL });
    if (action === 'forget') return ui.forgetPromptPayload();
    if (action === 'forget_confirm') {
      this.cancelUser(userId);
      this.prayers?.forget(userId);
      this.store.forget(userId);
      return ui.noticePayload('حُذفت بياناتك', 'توقفت التنبيهات، ومُحيت تفضيلاتك ومحفوظاتك من قاعدة البوت. لن يُنشأ اشتراك جديد إلا باختيارك.');
    }
    if (action === 'enable') {
      if (guildId) this.store.subscribe(userId, guildId);
      else if (this.store.subscriptions(userId).length) this.store.updateUser(userId, { enabled: true, pausedUntil: 0 });
      else return ui.noticePayload('فعّله من سيرفرك', 'اختر «مساحتي مع رفيق» من بطاقة السيرفر الذي تريده، ثم فعّل تذكير المجلس هناك.');
      if (this.store.getUser(userId).dmBlocked) return settings('حُفظ اشتراكك، لكن الإرسال معلّق حتى ينجح اختبار الخاص.');
      return ui.enabledPayload(this.store.getUser(userId));
    }
    if (action === 'disable') {
      this.cancelUser(userId);
      this.store.transaction(() => {
        this.store.updateUser(userId, { enabled: false, pausedUntil: 0, breakAt: null });
        this.store.disablePrayer(userId);
      });
      return ui.disabledPayload();
    }
    if (action === 'unsubscribe_here') {
      if (!guildId) return ui.noticePayload('اختر السيرفر أولًا', 'افتح /rafiq في السيرفر الذي تريد إلغاء تذكيره، ثم ادخل إلى إعداداتك.');
      this.store.unsubscribe(userId, guildId);
      this.cancelGuild(userId, guildId);
      return settings('أُلغي تذكير المجلس في هذا السيرفر فقط. بقي مؤقّتك ومحفوظاتك واختيارات السيرفرات الأخرى.');
    }
    if (action === 'pause_today') {
      this.cancelUser(userId);
      this.store.updateUser(userId, { pausedUntil: this.now() + DAY, breakAt: null });
      return ui.pausedPayload();
    }
    if (action === 'resume') {
      this.store.updateUser(userId, { pausedUntil: 0 });
      const p = this.store.getPrayer(userId);
      if (p.enabled) this.store.setPrayer(userId, { ...p, activatedAt: this.now() });
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
    const cardAction = /^(source|card|favorite)_([a-z-]+)(_saved)?$/.exec(action);
    if (cardAction && dhikrById(cardAction[2])) {
      const [, kind, cardId, saved] = cardAction;
      if (kind === 'source') return ui.sourcePayload(cardId, { onlyFavorites: Boolean(saved) });
      if (kind === 'favorite') this.store.toggleFavorite(userId, cardId);
      return library(cardId, Boolean(saved));
    }
    if (action.startsWith('report_')) {
      const reportCard = dhikrById(action.slice(7)) || ideaById(action.slice(7));
      if (reportCard) return ui.supportPayload({ supportURL: this.supportURL, reportCard });
    }
    if (action === 'idea_category') {
      if (values.length === 1 && (values[0] === 'saved' || IDEA_CATEGORIES.some(item => item.id === values[0]))) return idea(0, values[0]);
      return ui.noticePayload('اختيار غير صالح', 'اختر نوع الفكرة من القائمة.');
    }
    const saveIdea = /^idea_save_([a-z-]+)_(all|family|friends|play|saved)$/.exec(action);
    if (saveIdea && ideaById(saveIdea[1])) {
      this.store.toggleIdeaFavorite(userId, saveIdea[1]);
      return idea(GOOD_DEEDS.indexOf(ideaById(saveIdea[1])), saveIdea[2]);
    }
    const ideaSource = /^idea_source_([a-z-]+)_(all|family|friends|play|saved)$/.exec(action);
    if (ideaSource && ideaById(ideaSource[1])) return ui.ideaSourcePayload(ideaSource[1], { category: ideaSource[2] });
    const ideaAction = /^idea_(all|family|friends|play|saved)_(\d+)$/.exec(action);
    if (ideaAction && Number(ideaAction[2]) < GOOD_DEEDS.length) {
      return idea(Number(ideaAction[2]), ideaAction[1]);
    }
    if (action === 'idea' || /^idea_\d+$/.test(action)) {
      const index = action === 'idea' ? 0 : Number(action.slice(5));
      if (index < GOOD_DEEDS.length) return idea(index);
    }
    if (action === 'break') return ui.breakPayload(user);
    if (action === 'break_cancel') {
      if (user.breakAt !== null) this.store.updateUser(userId, { breakAt: null });
      return ui.breakPayload({ ...user, breakAt: null, notice: 'أُلغي المؤقّت.' });
    }
    if (action === 'break_extend_15') {
      if (user.paused || user.dmBlocked) return settings('استأنف التنبيهات وتأكد من وصول الخاص قبل تمديد المؤقّت.');
      if (user.breakAt === null || user.breakAt <= this.now()) return ui.breakPayload({ notice: 'انتهى المؤقّت السابق. اختر مدة جديدة إن أردت.' });
      const breakAt = Math.min(user.breakAt + 15 * MINUTE, this.now() + 120 * MINUTE);
      this.store.updateUser(userId, { breakAt });
      return ui.breakPayload({ ...user, breakAt, notice: 'حُدّث موعد الاستراحة. الحد الأقصى ساعتان من الآن.' });
    }
    if (['break_15', 'break_30', 'break_60', 'break_90'].includes(action)) {
      if (user.paused) return ui.noticePayload('التنبيهات متوقفة مؤقتًا', 'استأنف التنبيهات من الإعدادات، ثم اضبط مؤقّتك.');
      if (user.dmBlocked) return settings('تعذّر الوصول إلى الخاص سابقًا. افتحه في ديسكورد، ثم اضغط «اختبر الخاص».');
      const breakAt = this.now() + Number(action.slice(6)) * MINUTE;
      this.store.updateUser(userId, { breakAt });
      return ui.breakPayload({ ...user, breakAt, notice: '✓ ضُبط مؤقّت واحد لك' });
    }
    if (action === 'test_dm') {
      const now = this.now();
      if (user.lastTestAt !== null && now - user.lastTestAt < MINUTE) return settings('انتظر دقيقة بين اختبارات الخاص.');
      this.store.updateUser(userId, { lastTestAt: now });
      try {
        await this.sendDM(userId, ui.reminderPayload({ silent: user.delivery === 'silent' }), `test:${userId}:${now}`);
        this.store.updateUser(userId, { dmBlocked: false });
        const p = this.store.getPrayer(userId);
        if (user.dmBlocked && p.enabled) this.store.setPrayer(userId, { ...p, activatedAt: this.now() });
        return settings('✓ أُرسلت رسالة تجريبية إلى الخاص');
      } catch (error) {
        if (Number(error.code) === 50007) this.store.updateUser(userId, { dmBlocked: true });
        return settings('لم تصل الرسالة. تأكد من السماح بالرسائل الخاصة من أعضاء السيرفر ومن عدم حظر البوت، ثم جرّب مجددًا.');
      }
    }
    return ui.noticePayload('هذا الخيار لم يعد متاحًا', 'افتح مساحتك لاستخدام الأزرار الحالية.');
  }
}

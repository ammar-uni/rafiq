import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P, Routes } from 'discord.js';
import { APP_DESCRIPTION, COMMANDS } from '../src/commands.mjs';
import { setupPanel } from '../src/discord-adapter.mjs';
import { welcomePayload } from '../src/messages.mjs';
import { registerApplication } from '../src/registration.mjs';
import { ServerApp } from '../src/server-app.mjs';
import { Store } from '../src/store.mjs';

function controls(payload) {
  const result = new Map();
  function visit(item) {
    if (item.custom_id) result.set(item.custom_id.slice(9), item);
    item.components?.forEach(visit);
    if (item.accessory) visit(item.accessory);
  }
  payload.components.forEach(visit);
  return result;
}

function panelFixture(t) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const calls = [], bot = {id:'9'}, member = {id:'1',permissions:{has:()=>true}};
  const message = {id:'1001',channelId:'101',url:'https://discord.com/channels/10/101/1001',edit:async payload=>{calls.push(['edit',payload]);return message;}};
  const channel = {id:'101',guildId:'10',type:0,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),messages:{fetch:async()=>message},send:async payload=>{calls.push(['send',payload]);return message;}};
  const interaction = {inGuild:()=>true,guildId:'10',memberPermissions:{has:()=>true},user:{id:'1'},channel,options:{getChannel:()=>null},guild:{members:{me:bot,fetch:async()=>member},channels:{fetch:async()=>channel}}};
  return {store,calls,message,channel,interaction,bot,member};
}

test('setup defaults to the current channel and updates the same card without activating reminders', async t => {
  const h = panelFixture(t), before = h.store.getServer('10');
  assert.equal(COMMANDS.find(c=>c.name==='rafiq-setup').options[0].required, false);
  const first = await setupPanel(h);
  const second = await setupPanel(h);
  assert.deepEqual(h.calls.map(([kind])=>kind), ['send','edit']);
  assert.equal(h.store.getPanel('10').message_id,'1001');
  assert.deepEqual(h.store.getServer('10'),before);
  assert.deepEqual(h.store.subscriptions('1'),[]);
  assert.ok(controls(h.calls[0][1]).has('server_begin'));
  for (const [,payload] of h.calls) assert.deepEqual(payload.allowedMentions.parse,[]);
  assert.match(JSON.stringify(first),/قناة التذكيرات/);
  assert.match(JSON.stringify(second),/تحدّثت بطاقة رفيق/);
});

test('an explicitly selected card channel overrides the current channel and invalid targets are refused', async t => {
  const h = panelFixture(t);
  h.interaction.channel = null;
  h.interaction.options.getChannel = ()=>h.channel;
  await setupPanel(h);
  assert.equal(h.calls[0][0],'send');
  for (const target of [null,{...h.channel,guildId:'20'},{...h.channel,type:11}]) {
    h.interaction.options.getChannel = ()=>target;
    const result = await setupPanel(h);
    assert.match(JSON.stringify(result),/افتح قناة نصية/);
  }
  assert.equal(h.calls.length,1);
});

test('card setup checks both member and bot channel access before publishing', async t => {
  const h = panelFixture(t);
  h.channel.permissionsFor = person=>({has:()=>person===h.bot});
  assert.match(JSON.stringify(await setupPanel(h)),/تحقّق من صلاحياتك/);
  h.member.permissions.has = ()=>false;
  h.channel.permissionsFor = ()=>({has:()=>true});
  assert.match(JSON.stringify(await setupPanel(h)),/تحقّق من صلاحياتك/);
  h.member.permissions.has = ()=>true;
  h.channel.permissionsFor = ()=>({has:()=>false});
  assert.match(JSON.stringify(await setupPanel(h)),/أحتاج صلاحيات القناة/);
  assert.deepEqual(h.calls,[]);
  assert.equal(h.store.getPanel('10'),undefined);
});

test('a card in another channel is not duplicated and missing access does not create a new card', async t => {
  const h = panelFixture(t);
  h.store.setPanel('10','102','1002');
  h.message.channelId = '102';
  assert.match(JSON.stringify(await setupPanel(h)),/للسيرفر بطاقة موجودة/);
  h.interaction.guild.channels.fetch = async()=>{throw Object.assign(new Error('Denied'),{code:50013});};
  assert.match(JSON.stringify(await setupPanel(h)),/تعذّر تحديث البطاقة/);
  assert.deepEqual(h.calls,[]);
  assert.equal(h.store.getPanel('10').channel_id,'102');
});

test('the public card leads through three private steps and never chooses its own channel for a new server', async t => {
  const store = new Store(':memory:'); t.after(()=>store.close());
  store.setPanel('10','101','1001');
  const token='0123456789abcdef', app=new ServerApp({store,token:()=>token,checkTarget:async()=>null,now:()=>1800000000000});
  const visit=(action,values=[],canManage=true)=>app.handle({guildId:'10',userId:'1',canManage,action,values});
  const action=controls(welcomePayload()).get('server_begin').custom_id.slice(9);
  const denied=await visit(action,[],false);
  assert.match(JSON.stringify(denied),/للمشرف/);
  assert.equal(app.drafts.size,0);
  let page=await visit(action);
  assert.ok(page.flags&64);
  assert.match(JSON.stringify(page),/١ من ٣/);
  assert.equal(app.drafts.get(token).p.channelId,null);
  assert.equal(controls(page).get(`server_${token}_edit`).disabled,true);
  await visit(`server_${token}_channel`,['102']);
  page=await visit(`server_${token}_edit`);
  assert.match(JSON.stringify(page),/٢ من ٣/);
  await visit(`server_${token}_count`,['2']);
  await visit(`server_${token}_channel_step`);
  assert.equal(app.drafts.get(token).p.dailyCount,2);
  page=await visit(`server_${token}_review`);
  assert.match(JSON.stringify(page),/٣ من ٣/);
  assert.equal(store.getServer('10').enabled,false);
  await visit(`server_${token}_save`);
  assert.equal(store.getServer('10').channelId,'102');
  assert.equal(store.getServer('10').dailyCount,2);
  assert.equal(store.getServer('10').enabled,true);
  const saved=store.getServer('10');
  await visit('server_begin');
  assert.equal(app.drafts.get(token).p.channelId,'102');
  await visit('server_home');
  assert.deepEqual(store.getServer('10'),saved);
  assert.deepEqual(store.subscriptions('1'),[]);
});

test('global registration checks identity first and changes only the agreed public description', async () => {
  const writes=[];
  const rest={get:async()=>({id:'123',description:'old'}),post:async(route,{body})=>writes.push(['post',route,body]),patch:async(route,{body})=>writes.push(['patch',route,body])};
  await assert.rejects(registerApplication(rest,{applicationId:'456'}),{code:'RAF_APP_MISMATCH'});
  assert.deepEqual(writes,[]);
  await registerApplication(rest,{applicationId:'123'});
  assert.equal(writes.filter(([method])=>method==='post').length,COMMANDS.length);
  assert.deepEqual(writes.at(-1),['patch',Routes.currentApplication(),{description:APP_DESCRIPTION}]);
  assert.ok(APP_DESCRIPTION.length<=400);
  assert.match(APP_DESCRIPTION,/\/rafiq-setup/);
  assert.match(APP_DESCRIPTION,/إعداد سيرفرك/);
  assert.equal(COMMANDS.find(c=>c.name==='rafiq-setup').default_member_permissions,P.ManageGuild.toString());
});

test('test-server registration preserves the public profile and existing global command definitions', async () => {
  const definitions=structuredClone(COMMANDS), writes=[];
  const rest={get:async()=>({id:'123'}),post:async(route,{body})=>writes.push({route,body}),patch:async()=>assert.fail('Test registration must not change public metadata')};
  await registerApplication(rest,{applicationId:'123',guildId:'456'});
  assert.equal(writes.length,COMMANDS.length);
  for (const {route,body} of writes) { assert.equal(route,Routes.applicationGuildCommands('123','456')); assert.equal(body.contexts,undefined); assert.equal(body.integration_types,undefined); }
  assert.deepEqual(COMMANDS,definitions);
});

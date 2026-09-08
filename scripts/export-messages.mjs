import { mkdir, writeFile } from 'node:fs/promises';
import { welcomePayload, reminderPayload, enabledPayload, settingsPayload, ideaPayload, homePayload, libraryPayload, breakPayload, methodologyPayload, privacyPayload, supportPayload } from '../src/messages.mjs';
import { reminderIntroPayload, sourcePayload, ideaSourcePayload } from '../src/messages.mjs';
const destination = new URL('../examples/', import.meta.url);
await mkdir(destination, { recursive:true });
const payloads = {welcome:welcomePayload(),reminder:reminderPayload(),enabled:enabledPayload(),settings:settingsPayload(),idea:ideaPayload(),home:homePayload(),library:libraryPayload(),break:breakPayload(),methodology:methodologyPayload(),privacy:privacyPayload(),support:supportPayload(),'reminder-intro':reminderIntroPayload(),source:sourcePayload('majlis'),'idea-source':ideaSourcePayload('parents')};
for (const [name,payload] of Object.entries(payloads)) await writeFile(new URL(`${name}.json`,destination),JSON.stringify(payload,null,2)+'\n');
console.log(`${Object.keys(payloads).length} Discord message payloads exported to examples/.`);

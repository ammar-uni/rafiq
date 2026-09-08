import { Store } from '../../src/store.mjs';

const store = new Store(process.env.TEST_DATA_FILE, { encryptionKey: process.env.TEST_DATA_KEY });
store.subscribe('123456789012345678', '234567890123456789');
process.send({ ready: true });
process.on('message', () => { store.close(); process.disconnect(); });

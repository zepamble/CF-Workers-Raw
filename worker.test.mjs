import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';

const source = await readFile(new URL('./_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalFetch = globalThis.fetch;
const raw = 'https://raw.githubusercontent.com/zepamble/proxy-configs/main/';
const endpoint = 'https://ghp.zepamble.com/';
const env = { GH_TOKEN: 'test-upstream-credential', TOKEN: 'test-download&=中文' };
let calls;

beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response('DOMAIN,example.com\n');
    };
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('renders token placeholders for existing and future rule lists', async () => {
    const template = ['DIRECT', 'PROXY', 'AI', 'US', 'NEW'].map(name =>
        `RULE-SET,${endpoint}${raw}rules/${name}.list?token=__DOWNLOAD_TOKEN__,DIRECT`
    ).join('\n') + '\n# __DOWNLOAD_TOKEN__\nRULE-SET,https://gh.zepamble.com/public,DIRECT'
        + `\nRULE-SET,${endpoint}${raw}rules/OTHER.list?v=1&token=__DOWNLOAD_TOKEN__&extra=1,AI`
        + `\nRULE-SET,${endpoint}${raw}rules/EXACT.list?token=__DOWNLOAD_TOKEN___SUFFIX,AI`;
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response(template, { headers: { ETag: 'old', 'Content-Length': '1', 'Content-Encoding': 'gzip' } });
    };
    const result = await worker.fetch(new Request(`${endpoint}${raw}Config.conf?token=${encodeURIComponent(env.TOKEN)}`), env);
    const body = await result.text();
    assert.equal(result.status, 200);
    assert.equal(body.match(/token=test-download%26%3D%E4%B8%AD%E6%96%87/g).length, 6);
    assert.ok(body.includes('&extra=1,AI'));
    assert.ok(body.includes('?token=__DOWNLOAD_TOKEN___SUFFIX,AI'));
    assert.ok(body.includes('# __DOWNLOAD_TOKEN__'));
    assert.ok(body.includes('https://gh.zepamble.com/public'));
    assert.ok(!body.includes(env.GH_TOKEN));
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    for (const name of ['etag', 'content-length', 'content-encoding']) assert.equal(result.headers.get(name), null);
    assert.equal(calls[0].url, `${raw}Config.conf`);
    assert.equal(calls[0].options.headers.get('Authorization'), `token ${env.GH_TOKEN}`);
    assert.equal(calls[0].options.redirect, 'manual');
});

test('missing or invalid download tokens never reach GitHub', async () => {
    for (const query of ['', '?token=wrong']) {
        const result = await worker.fetch(new Request(`${endpoint}${raw}Config.conf${query}`), env);
        assert.equal(result.status, 403);
    }
    assert.equal(calls.length, 0);
});

test('a previous request cannot lend its GitHub credential to another request', async () => {
    const first = await worker.fetch(new Request(`${endpoint}${raw}rules/AI.list?token=${encodeURIComponent(env.TOKEN)}`), env);
    assert.equal(first.status, 200);
    const second = await worker.fetch(new Request(`${endpoint}${raw}rules/AI.list`), {});
    assert.equal(second.status, 400);
    assert.equal(calls.length, 1);
});

test('rule list contents are returned unchanged', async () => {
    const result = await worker.fetch(new Request(`${endpoint}${raw}rules/AI.list?token=${encodeURIComponent(env.TOKEN)}`), env);
    assert.equal(await result.text(), 'DOMAIN,example.com\n');
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('TOKEN_PATH uses its authenticated download token in the template', async () => {
    globalThis.fetch = async () => new Response(`RULE-SET,${endpoint}${raw}rules/AI.list?token=__DOWNLOAD_TOKEN__,AI`);
    const result = await worker.fetch(new Request(`${endpoint}${raw}Config.conf?token=path-download`), {
        GH_TOKEN: env.GH_TOKEN,
        TOKEN_PATH: 'path-download@https://raw.githubusercontent.com/zepamble/proxy-configs/main',
    });
    assert.equal(result.status, 200);
    assert.ok((await result.text()).includes('?token=path-download,AI'));
});

test('the GitHub credential is never rendered as a download token', async () => {
    const result = await worker.fetch(new Request(`${endpoint}${raw}Config.conf`), { GH_TOKEN: env.GH_TOKEN });
    assert.equal(result.status, 500);
    assert.ok(!(await result.text()).includes(env.GH_TOKEN));
});

test('network failures return a generic error without credential details', async () => {
    globalThis.fetch = async () => { throw new Error(env.GH_TOKEN); };
    const result = await worker.fetch(new Request(`${endpoint}${raw}Config.conf?token=${encodeURIComponent(env.TOKEN)}`), env);
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes(env.GH_TOKEN));
});

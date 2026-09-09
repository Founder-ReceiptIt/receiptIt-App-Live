import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [gate, auth, app, form, routing, intro, vercel] = await Promise.all([
  readFile(new URL('src/components/auth/AlphaGatekeeper.tsx', root), 'utf8'),
  readFile(new URL('src/contexts/AuthContext.tsx', root), 'utf8'),
  readFile(new URL('src/App.tsx', root), 'utf8'),
  readFile(new URL('src/components/auth/AuthForm.tsx', root), 'utf8'),
  readFile(new URL('src/lib/authRouting.ts', root), 'utf8'),
  readFile(new URL('src/components/auth/ProductIntro.tsx', root), 'utf8'),
  readFile(new URL('vercel.json', root), 'utf8'),
]);

assert.match(routing, /'#settings'/, 'Settings must be recognised as a protected hash');
assert.match(routing, /history\.replaceState/, 'protected-route cleanup must replace browser history');
assert.match(routing, /prepareSignedOutRoute[\s\S]*EXISTING_USER_SIGN_IN_KEY[\s\S]*['"]\/signin['"]/, 'sign-out must resolve to the existing-user sign-in route');
assert.match(auth, /const signOut = async \(\) => \{\s*prepareSignedOutRoute\(\)/, 'sign-out must clean routing before clearing the session');
assert.match(auth, /getSession\(\)[\s\S]*\.catch\([\s\S]*\.finally\(\(\) => \{\s*setLoading\(false\)/, 'auth bootstrap failures must resolve loading');
assert.doesNotMatch(app, /setTimeout\([\s\S]*setShowApp/, 'the app must not add an arbitrary post-auth loading delay');

assert.match(gate, /window\.location\.pathname === '\/signin'/, 'direct sign-in must be recognised');
assert.doesNotMatch(gate, /window\.location\.pathname === '\/signup'[\s\S]*EXISTING_USER_SIGN_IN_KEY/, 'direct signup must not receive the existing-user bypass');
assert.match(gate, /clearProtectedAppRoute\(\)/, 'signed-out protected hashes must be cleared');
assert.ok(gate.indexOf('if (signupAuthorization && !hasCompletedAuthorisedIntro)') < gate.indexOf('if (signupAuthorization && hasCompletedAuthorisedIntro)'), 'authorised new users must see the intro before signup');
assert.doesNotMatch(intro, /Already have an account\? Sign in/, 'sign in must not appear inside the new-user intro');

assert.match(form, /Boolean\(sessionStorage\.getItem\(SIGNUP_AUTHORIZATION_KEY\)\)/, 'signup visibility must require an access grant');
assert.match(auth, /create-account[\s\S]*signupAuthorization: sessionStorage\.getItem\(SIGNUP_AUTHORIZATION_KEY\)/, 'account creation must send the server-issued access grant');

const rewrites = JSON.parse(vercel).rewrites;
assert.ok(rewrites.some(({ source, destination }) => source === '/signin' && destination === '/index.html'), 'Vercel must serve the sign-in route safely on refresh');
assert.ok(rewrites.some(({ source, destination }) => source === '/signup' && destination === '/index.html'), 'Vercel must serve the gated signup route safely on refresh');

console.log('Auth/gate routing guard passed.');

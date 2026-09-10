import assert from 'node:assert/strict';
import { getWalletCategories } from '../src/lib/walletCategories.ts';
assert.deepEqual(getWalletCategories(['Other','Transport','Groceries','Tech','Other']),['All','Tech','Groceries','Transport','Other']);
assert.deepEqual(getWalletCategories(['Other','Toys','Fashion','Utility','Meals','Transport','Groceries','Tech']),['All','Tech','Groceries','Transport','Meals','Utility','Fashion','Toys','Other']);
assert.deepEqual(getWalletCategories(['Other','Travel','Technology','Entertainment']),['All','Technology','Entertainment','Travel','Other']);
assert.deepEqual(getWalletCategories([]),['All']);
console.log('PASS Wallet category order: priority categories, canonical extensions, legacy values, Other last, dedupe and empty state');

#!/usr/bin/env node
// swal-preflight — entry point
import { run } from '../src/index.js';
run(process.argv.slice(2)).catch(e => { console.error('✖', e.message); process.exit(1); });
